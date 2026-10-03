import {
  createInitialVersion,
  executeTransactionalRun,
  VersionManager,
} from '../src/lib/core/transaction';
import type { CleaningOperation } from '../src/lib/core/types';

export async function runVersionRestoreTests(): Promise<{
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
    'inventory.csv',
    ['sku', 'name', 'price'],
    [
      { sku: 'SKU-1', name: 'widget', price: '$10.00' },
      { sku: 'SKU-2', name: 'gadget', price: '$20.00' },
    ]
  );

  const manager = new VersionManager(v0);

  // 1. Run 1: Uppercase names -> creates v1
  const op1: CleaningOperation = {
    operationId: 'op_upper',
    type: 'uppercase',
    targetColumns: ['name'],
    reason: 'Uppercase',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };

  const res1 = await executeTransactionalRun(v0, [op1], (rows, headers) => ({
    rows: rows.map((r) => ({ ...r, name: r.name.toUpperCase() })),
    headers,
  }));
  manager.commit(res1.newVersion!, res1.run);
  assert(manager.getCurrentVersion()?.versionNumber === 1, 'Current version is v1');
  assert(manager.getCurrentVersion()?.rows[0].name === 'WIDGET', 'v1 has WIDGET');

  // 2. Run 2: Trim -> creates v2
  const op2: CleaningOperation = {
    operationId: 'op_trim',
    type: 'trim',
    targetColumns: ['price'],
    reason: 'Trim price',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };
  const res2 = await executeTransactionalRun(manager.getCurrentVersion()!, [op2], (rows, headers) => ({
    rows,
    headers,
  }));
  manager.commit(res2.newVersion!, res2.run);
  assert(manager.getCurrentVersion()?.versionNumber === 2, 'Current version is v2');

  // 3. Restore Version 0: must create Version 3 derived from Version 0 without erasing history!
  const restoredV3 = manager.restoreVersion(0, 'Restored from Initial v0');
  assert(restoredV3 !== null, 'restoreVersion returns restored version');
  assert(restoredV3?.versionNumber === 3, 'Restored version is new version v3 (history not erased)');
  assert(manager.getAllVersions().length === 4, 'History contains 4 versions [v0, v1, v2, v3]');
  assert(restoredV3?.rows[0].name === 'widget', 'Restored v3 has original lowercase widget');
  assert(manager.getVersion(1)?.rows[0].name === 'WIDGET', 'v1 still exists in history with WIDGET');

  // 4. Compare Versions
  const compareResult = manager.compareVersions(0, 1);
  assert(compareResult.diffCount === 2, 'Comparing v0 to v1 identifies 2 cell differences (both names)');
  assert(compareResult.rowCountBefore === 2, 'rowCountBefore is 2');
  assert(compareResult.rowCountAfter === 2, 'rowCountAfter is 2');
  assert(compareResult.modifiedRows.length === 2, '2 rows modified between v0 and v1');
  assert(compareResult.modifiedRows[0].changes[0].column === 'name', 'Modified column is name');
  assert(compareResult.modifiedRows[0].changes[0].before === 'widget', 'Before value is widget');
  assert(compareResult.modifiedRows[0].changes[0].after === 'WIDGET', 'After value is WIDGET');

  // 5. Compare with non-existent version handled safely
  const invalidCompare = manager.compareVersions(999, 1);
  assert(invalidCompare.diffCount === 0, 'Invalid version comparison returns 0 diffs safely');
  assert(invalidCompare.fromVersion === null, 'fromVersion is null for non-existent version');

  return { suite: 'P1 Version-Based Restore & Compare', passed, failed, errors };
}
