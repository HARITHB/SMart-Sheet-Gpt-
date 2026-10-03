import { createInitialVersion, executeTransactionalRun } from '../src/lib/core/transaction';
import { validatePostClean } from '../src/lib/core/postCleanValidator';
import type { DatasetRow, CleaningOperation } from '../src/lib/core/types';

export async function runPostCleanValidatorTests(): Promise<{
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

  // 1. Setup base version with some messy data
  const v0 = createInitialVersion(
    'contacts.csv',
    ['id', 'name', 'email', 'phone', 'zip'],
    [
      { id: 'C-1', name: 'alice smith', email: 'alice@example.com', phone: '1234567890', zip: '07030' },
      { id: 'C-2', name: 'bob jones', email: 'invalid-email', phone: '555', zip: '02138' },
      { id: 'C-3', name: 'charlie brown', email: '', phone: '555-0199', zip: '90210' },
    ]
  );

  // 2. Perform safe transformation to v1
  const op: CleaningOperation = {
    operationId: 'op_title',
    type: 'titlecase',
    targetColumns: ['name'],
    reason: 'Title case names',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };

  const runResult = await executeTransactionalRun(v0, [op], (rows, headers) => {
    const updated = rows.map((r) => ({
      ...r,
      name: r.name.replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
    return { rows: updated, headers };
  });

  assert(runResult.success === true, 'Transactional run succeeded');
  const v1 = runResult.newVersion!;

  // 3. Post-clean validation
  const validation = validatePostClean(v0, v1, [op]);

  assert(validation.valid === true, 'Post-clean validation passes for safe run');
  assert(validation.rowsBefore === 3, 'Rows before is 3');
  assert(validation.rowsAfter === 3, 'Rows after is 3');
  assert(validation.changedCellsCount === 3, 'Changed cells count is 3');
  assert(validation.summary.changedSuccessfully === 3, 'All 3 changes classified as successful');
  assert(validation.invalidEmailCount === 1, 'Accurately detected 1 invalid email (invalid-email)');
  assert(validation.invalidPhoneCount === 1, 'Accurately detected 1 invalid phone (555)');
  assert(validation.missingValuesAfter === 1, 'Accurately detected 1 missing email value');
  assert(
    validation.assessmentNotice.includes('Not an absolute guarantee'),
    'Includes responsible assessment disclosure'
  );

  // 4. Suspicious change detection: drastic truncation
  const suspiciousRun = await executeTransactionalRun(v0, [op], (rows, headers) => {
    const updated = rows.map((r, i) => ({
      ...r,
      name: i === 0 ? 'A' : r.name, // "alice smith" -> "A" (truncation > 60%)
    }));
    return { rows: updated, headers };
  });

  assert(suspiciousRun.success === true, 'Suspicious run executed');
  const suspiciousReport = validatePostClean(v0, suspiciousRun.newVersion!, [op]);
  assert(suspiciousReport.suspiciousChanges.length === 1, 'Detected 1 suspicious change');
  assert(
    suspiciousReport.suspiciousChanges[0].reason.includes('truncation'),
    'Report explains truncation reason'
  );
  assert(suspiciousReport.summary.stillNeedsReview === 1, 'Flagged 1 change as still needing review');

  // 5. Suspicious change detection: cell emptied unexpectedly
  const emptiedRun = await executeTransactionalRun(v0, [op], (rows, headers) => {
    const updated = rows.map((r, i) => ({
      ...r,
      name: i === 1 ? '' : r.name, // "bob jones" emptied
    }));
    return { rows: updated, headers };
  });

  const emptiedReport = validatePostClean(v0, emptiedRun.newVersion!, [op]);
  assert(
    emptiedReport.suspiciousChanges.some((s) => s.reason.includes('emptied')),
    'Detected unexpectedly emptied cell'
  );

  return { suite: 'P1 Post-Clean Validation Engine', passed, failed, errors };
}
