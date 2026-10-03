import { attachRowIds } from '../src/lib/core/rowId';
import { deduplicateRows, analyzeDataset } from '../src/lib/analyzer';
import { transformColumn } from '../src/lib/transforms';
import { createInitialVersion, executeTransactionalRun } from '../src/lib/core/transaction';
import type { CleaningOperation } from '../src/lib/core/types';

export async function runLargeFileSimulationTests(): Promise<{
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

  // 1. Edge Case: 0 rows (empty dataset)
  const emptyRows = attachRowIds([]);
  const emptyHeaders = ['id', 'name'];
  assert(emptyRows.length === 0, '0 rows handled safely');
  const emptyDedup = deduplicateRows(emptyHeaders, emptyRows);
  assert(emptyDedup.length === 0, 'Deduplicating 0 rows yields 0 rows');

  // 2. Edge Case: 1 row
  const singleRow = attachRowIds([{ id: '1', name: '  solitary row  ' }]);
  assert(singleRow.length === 1, '1 row handled safely');
  assert(singleRow[0]._tr_id === 'tr_row_1', 'Row 1 has stable row ID');
  const singleTrimmed = transformColumn(singleRow, 'name', 'trim');
  assert(singleTrimmed[0].name === 'solitary row', 'Single row transformed');

  // 3. Medium Scales: 10, 100, 500 rows
  const generateDataset = (count: number) => {
    const raw = [];
    for (let i = 0; i < count; i++) {
      raw.push({
        id: `ID-${i + 1}`,
        name: `user ${i + 1}`,
        email: `user${i + 1}@example.com`,
        zip: '07030',
        phone: '123-456-7890',
        amount: `$${(i * 1.5).toFixed(2)}`,
      });
    }
    return raw;
  };

  const rows100 = attachRowIds(generateDataset(100));
  assert(rows100.length === 100, '100 rows created');
  assert(rows100[99]._tr_id === 'tr_row_100', 'Row 100 has stable ID tr_row_100');

  const rows500 = attachRowIds(generateDataset(500));
  assert(rows500.length === 500, '500 rows created');

  // 4. Large Scale: 2,500 rows with 500 duplicates (total 3,000 rows)
  const base2500 = generateDataset(2500);
  const dupes500 = base2500.slice(0, 500).map((r) => ({ ...r }));
  const largeSetRaw = [...base2500, ...dupes500];

  const startTime = Date.now();
  const largeRows = attachRowIds(largeSetRaw);
  assert(largeRows.length === 3000, '3,000 rows created with stable IDs');

  // Fast deduplication check
  const largeHeaders = ['id', 'name', 'email', 'zip', 'phone', 'amount'];
  const dedupedLarge = deduplicateRows(largeHeaders, largeRows);
  const elapsed = Date.now() - startTime;

  assert(dedupedLarge.length === 2500, 'Accurately collapsed 500 duplicates from 3,000 rows');
  assert(elapsed < 1500, `Large dataset operations completed quickly (${elapsed}ms < 1500ms)`);

  // 5. Transactional execution at scale
  const v0Large = createInitialVersion('large.csv', largeHeaders, base2500);
  const op: CleaningOperation = {
    operationId: 'op_title_large',
    type: 'titlecase',
    targetColumns: ['name'],
    reason: 'Title case all names',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };

  const scaleRun = await executeTransactionalRun(v0Large, [op], (rows, headers) => {
    const updated = transformColumn(rows, 'name', 'titlecase');
    return { rows: updated, headers };
  });

  assert(scaleRun.success === true, 'Transactional run succeeded at scale');
  assert(scaleRun.newVersion?.rows.length === 2500, '2,500 rows transformed transactionally');
  assert(scaleRun.newVersion?.rows[0].name === 'User 1', 'Row 1 name title-cased');
  assert(v0Large.rows[0].name === 'user 1', 'Original v0 rows remain immutable at scale');

  return { suite: 'P1 Large Dataset Scalability & Performance', passed, failed, errors };
}
