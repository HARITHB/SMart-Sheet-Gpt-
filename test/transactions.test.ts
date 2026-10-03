import {
  createInitialVersion,
  executeTransactionalRun,
  VersionManager,
} from '../src/lib/core/transaction';
import type { DatasetRow, CleaningOperation } from '../src/lib/core/types';

export async function runTransactionTests(): Promise<{
  suite: string;
  passed: number;
  failed: number;
  errors: string[];
}> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${testName}`);
    }
  }

  const v0 = createInitialVersion(
    'orders.csv',
    ['order_id', 'customer', 'status', 'feedback'],
    [
      { order_id: 'ORD-1', customer: 'Alice', status: 'new', feedback: 'Great service' },
      { order_id: 'ORD-2', customer: 'Bob', status: 'pending', feedback: 'Slow delivery' },
      { order_id: 'ORD-3', customer: 'Charlie', status: 'closed', feedback: 'Average' },
    ]
  );

  const manager = new VersionManager(v0);
  assert(manager.getCurrentVersion()?.versionNumber === 0, 'VersionManager initializes at v0');

  // 1. Transactional Success creates v1 and preserves v0 immutability
  const op: CleaningOperation = {
    operationId: 'op_1',
    type: 'uppercase',
    targetColumns: ['status'],
    reason: 'Convert status to uppercase',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };

  const successResult = await executeTransactionalRun(
    v0,
    [op],
    (candidateRows) => {
      const updated = candidateRows.map((r) => ({ ...r, status: r.status.toUpperCase() }));
      return { rows: updated, headers: v0.headers };
    }
  );

  assert(successResult.success === true, 'Successful run returns success: true');
  assert(successResult.newVersion?.versionNumber === 1, 'New version is v1');
  assert(successResult.changeRecords.length === 3, 'Generated 3 change records');
  assert(successResult.changeRecords[0].rowId === 'tr_row_1', 'Change record references stable row ID tr_row_1');

  // Verify base v0 was NOT mutated
  assert(v0.rows[0].status === 'new', 'Base v0 remains completely immutable');

  // Commit to VersionManager
  if (successResult.newVersion) {
    manager.commit(successResult.newVersion, successResult.run);
  }
  assert(manager.getCurrentVersion()?.versionNumber === 1, 'Manager points to v1');
  assert(manager.canUndo() === true, 'canUndo is true after commit');

  // 2. Transactional Failure Atomicity (Zero Partial Commits) - Multi-batch AI failure
  const failOp: CleaningOperation = {
    operationId: 'op_ai_fail',
    type: 'ai_clean',
    targetColumns: ['customer'],
    reason: 'Simulated multi-batch AI failure',
    source: 'ai',
    confidence: 'high',
    deterministic: false,
    reviewRequired: false,
  };

  const v1 = manager.getCurrentVersion()!;
  let batchExecutions = 0;
  const failedResult = await executeTransactionalRun(
    v1,
    [failOp],
    async (candidateRows) => {
      // Batch 1 succeeds
      candidateRows[0].customer = 'ALICE_CLEANED';
      batchExecutions++;

      // Batch 2 fails (e.g. rate limit / network drop)
      batchExecutions++;
      throw new Error('API Rate Limit: 429 Too Many Requests on batch 2');
    }
  );

  assert(failedResult.success === false, 'Failed multi-batch AI execution returns success: false');
  assert(failedResult.error?.includes('API Rate Limit') === true, 'Error message is preserved');
  assert(v1.rows[0].customer === 'Alice', 'Committed v1 state was NOT partially mutated on batch 1');
  assert(manager.getCurrentVersion()?.versionNumber === 1, 'Manager remains at v1 with zero partial commits');
  assert(batchExecutions === 2, 'Simulated batch 1 executed before batch 2 crash');

  // 3. Cancellation Safety: User cancels midway through batches
  let isCancelled = false;
  const cancelResult = await executeTransactionalRun(
    v1,
    [failOp],
    async (candidateRows, headers, signal) => {
      // Process first item
      candidateRows[0].customer = 'SHOULD_NOT_COMMIT';
      // User triggers cancellation
      isCancelled = true;
      if (signal?.isCancelled && signal.isCancelled()) {
        return { rows: candidateRows, headers };
      }
      return { rows: candidateRows, headers };
    },
    { isCancelled: () => isCancelled }
  );

  assert(cancelResult.success === false, 'Cancelled execution returns success: false');
  assert(cancelResult.error?.includes('cancelled') === true, 'Cancellation error reported');
  assert(v1.rows[0].customer === 'Alice', 'Committed state untouched after cancellation');

  // 4. Sentiment Atomicity (Same transactional execution path)
  const sentimentOp: CleaningOperation = {
    operationId: 'op_sentiment_1',
    type: 'sentiment',
    targetColumns: ['feedback'],
    reason: 'Classify customer sentiment',
    source: 'ai',
    confidence: 'high',
    deterministic: false,
    reviewRequired: false,
  };

  // 4a. Sentiment failure rolls back completely
  const sentimentFailResult = await executeTransactionalRun(
    v1,
    [sentimentOp],
    async (candidateRows) => {
      candidateRows[0].feedback = 'Positive';
      throw new Error('Gemini API quota exhausted');
    }
  );
  assert(sentimentFailResult.success === false, 'Failed sentiment run returns success: false');
  assert(v1.rows[0].feedback === 'Great service', 'Feedback column untouched after sentiment failure');

  // 4b. Sentiment success commits atomically
  const sentimentSuccessResult = await executeTransactionalRun(
    v1,
    [sentimentOp],
    async (candidateRows) => {
      const updated = candidateRows.map((r, i) => ({
        ...r,
        feedback: i === 0 ? 'Positive' : i === 1 ? 'Negative' : 'Neutral',
      }));
      return { rows: updated, headers: v1.headers };
    }
  );
  assert(sentimentSuccessResult.success === true, 'Successful sentiment run succeeds');
  assert(sentimentSuccessResult.changeRecords.length === 3, 'Sentiment generated 3 change records');
  assert(sentimentSuccessResult.changeRecords[0].after === 'Positive', 'Sentiment classified row 1 as Positive');
  assert(sentimentSuccessResult.changeRecords[0].source === 'ai', 'Sentiment change record source is ai');

  if (sentimentSuccessResult.newVersion) {
    manager.commit(sentimentSuccessResult.newVersion, sentimentSuccessResult.run);
  }
  assert(manager.getCurrentVersion()?.versionNumber === 2, 'Manager commits v2 after sentiment');

  // 5. Pre-execution Block: Conflicting Operations in same run
  const conflictingRunOps: CleaningOperation[] = [
    {
      operationId: 'c1',
      type: 'uppercase',
      targetColumns: ['status'],
      reason: 'Upper status',
      source: 'deterministic',
      confidence: 'high',
      deterministic: true,
      reviewRequired: false,
    },
    {
      operationId: 'c2',
      type: 'lowercase',
      targetColumns: ['status'],
      reason: 'Lower status',
      source: 'deterministic',
      confidence: 'high',
      deterministic: true,
      reviewRequired: false,
    },
  ];
  let applyFnCalledOnConflict = false;
  const conflictResult = await executeTransactionalRun(
    v1,
    conflictingRunOps,
    () => {
      applyFnCalledOnConflict = true;
      return { rows: v1.rows, headers: v1.headers };
    }
  );
  assert(conflictResult.success === false, 'Conflicting operations blocked before execution');
  assert(applyFnCalledOnConflict === false, 'applyFn was NEVER called for conflicting operations');
  assert(
    conflictResult.error?.includes('Conflicting casing operations') === true,
    'Error describes conflicting operations'
  );

  // 6. Pre-execution Block: Unknown Target Column
  const unknownColRunOp: CleaningOperation = {
    operationId: 'u1',
    type: 'trim',
    targetColumns: ['non_existent_field'],
    reason: 'Trim non-existent',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };
  let applyFnCalledOnUnknown = false;
  const unknownColResult = await executeTransactionalRun(
    v1,
    [unknownColRunOp],
    () => {
      applyFnCalledOnUnknown = true;
      return { rows: v1.rows, headers: v1.headers };
    }
  );
  assert(unknownColResult.success === false, 'Unknown target column blocked before execution');
  assert(applyFnCalledOnUnknown === false, 'applyFn was NEVER called for unknown target column');

  // 7. Undo restores prior version and maintains history integrity
  const v1Restored = manager.undo();
  assert(v1Restored?.versionNumber === 1, 'Undo restores version 1');
  assert(manager.getCurrentVersion()?.versionNumber === 1, 'Current version is back to v1');
  assert(manager.getCurrentVersion()?.rows[0].feedback === 'Great service', 'Restored v1 feedback');

  // 8. Immutable Original Data Audit
  const v0Restored = manager.resetToOriginal();
  assert(v0Restored?.versionNumber === 0, 'Reset returns to v0');
  assert(v0.rows[0].status === 'new', 'Original v0 row 0 status is still "new"');
  assert(v0.rows[0].customer === 'Alice', 'Original v0 row 0 customer is still "Alice"');
  assert(v0.rows[1].customer === 'Bob', 'Original v0 row 1 customer is still "Bob"');
  assert(v0.rows[2].customer === 'Charlie', 'Original v0 row 2 customer is still "Charlie"');
  assert(v0.headers.length === 4, 'Original v0 headers intact');

  return { suite: 'P0 Transactional Atomicity & Rollback', passed, failed, errors };
}
