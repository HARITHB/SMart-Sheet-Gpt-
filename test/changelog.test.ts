import { generateChangeLog, exportChangeLogCsv, formatChangeLogCsv } from '../src/lib/changelog';
import { attachRowIds, stripRowIds } from '../src/lib/core/rowId';
import { deduplicateRows } from '../src/lib/analyzer';
import { transformColumn } from '../src/lib/transforms';

export function runChangeLogTests(): {
  suite: string;
  passed: number;
  failed: number;
  errors: string[];
} {
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

  // Set up 4 rows with an exact duplicate at index 1
  const rawRows = [
    { Name: 'Alice Jenkins', City: 'New York' },
    { Name: 'Alice Jenkins', City: 'New York' }, // Duplicate row
    { Name: 'Bob Smith', City: 'austin' },        // Row 3
    { Name: 'Charlie Brown', City: 'Chicago' },   // Row 4
  ];

  const headers = ['Name', 'City'];
  const originalRows = attachRowIds(rawRows);

  // 1. Deduplicate rows (removes row 2)
  let currentRows = deduplicateRows(headers, originalRows);

  assert(originalRows.length === 4, 'Original dataset has 4 rows');
  assert(currentRows.length === 3, 'Cleaned dataset has 3 rows after deduplication');

  // Verify surviving rows have preserved their stable row IDs
  assert(currentRows[0]._tr_id === originalRows[0]._tr_id, 'Row 1 ID preserved');
  assert(currentRows[1]._tr_id === originalRows[2]._tr_id, 'Bob retains tr_row_3');
  assert(currentRows[2]._tr_id === originalRows[3]._tr_id, 'Charlie retains tr_row_4');

  // 2. Generate change log for deduplication
  const logDedup = generateChangeLog(headers, originalRows, currentRows, 'Deduplicate rows');

  // CRITICAL P0 TEST: In old index-based diff, Bob (row 3) was compared with Alice (row 2),
  // causing Bob to be falsely recorded as "changed from Alice".
  // With stable row ID matching, Bob is matched to Bob, so NO cell change is falsely recorded!
  const falseCellChanges = logDedup.filter((c) => c.rowNumber > 0 && c.column !== 'Record');
  assert(
    falseCellChanges.length === 0,
    'No false cell modifications recorded on surviving rows (No index-shift error!)'
  );

  // Verify that the duplicate row removal is accurately recorded referencing tr_row_2
  const removedRecords = logDedup.filter((c) => c.after === '[Removed duplicate row]');
  assert(removedRecords.length === 1, 'Exactly 1 duplicate row removal recorded');
  assert(
    removedRecords[0].rowId === originalRows[1]._tr_id,
    'Removed record references the exact deleted row ID tr_row_2'
  );

  // 3. Transform column on deduplicated dataset (austin -> Austin for Bob)
  currentRows = transformColumn(currentRows, 'City', 'titlecase');
  const logCombined = generateChangeLog(headers, originalRows, currentRows, 'Title Case City');

  const bobChanges = logCombined.filter((c) => c.rowId === originalRows[2]._tr_id);
  assert(bobChanges.length === 1, 'Bob has exactly 1 modification recorded');
  assert(bobChanges[0].before === 'austin', 'Bob before value is austin');
  assert(bobChanges[0].after === 'Austin', 'Bob after value is Austin');
  assert(bobChanges[0].column === 'City', 'Bob modified column is City');
  assert(bobChanges[0].rowNumber === 3, 'Bob original rowNumber is 3');

  // 4. Change log CSV export functionality
  const formattedCsv = formatChangeLogCsv(logCombined);
  assert(formattedCsv.includes('Original Value'), 'Formatted CSV has Original Value column');
  assert(formattedCsv.includes('Austin'), 'Formatted CSV has Austin');
  assert(formattedCsv.includes('tr_row_3'), 'Formatted CSV includes stable rowId tr_row_3');
  exportChangeLogCsv('dataset.csv', logCombined); // does not crash even without DOM in Node

  // 5. Internal row ID stripping on dataset export
  const exportedRows = stripRowIds(currentRows);
  assert(exportedRows.length === 3, 'Exported rows count matches currentRows');
  assert((exportedRows[0] as any)._tr_id === undefined, 'Row 1 has _tr_id stripped');
  assert((exportedRows[1] as any)._tr_id === undefined, 'Row 2 has _tr_id stripped');
  assert((exportedRows[2] as any)._tr_id === undefined, 'Row 3 has _tr_id stripped');
  assert(exportedRows[0].Name === 'Alice Jenkins', 'User data content is preserved');

  return { suite: 'P0 Change Log & Stable Row ID Tracking', passed, failed, errors };
}
