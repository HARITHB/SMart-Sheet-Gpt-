import {
  validateCsvExport,
  generateValidatedCsvExport,
} from '../src/lib/core/exportValidator';
import { attachRowIds } from '../src/lib/core/rowId';

export function runExportValidatorTests(): {
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

  const sampleRows = attachRowIds([
    { id: '101', name: 'Alice', zip: '07030', acct: '00456' },
    { id: '102', name: 'Bob', zip: '02138', acct: '00789' },
  ]);
  const headers = ['id', 'name', 'zip', 'acct'];

  // 1. Valid export passes validation
  const { csvString, validation } = generateValidatedCsvExport(headers, sampleRows);
  assert(validation.isValid === true, 'Valid CSV export passes validation');
  assert(validation.exportedRowCount === 2, 'Exported row count matches');
  assert(validation.exportedColumnCount === 4, 'Exported column count matches');
  assert(validation.noInternalIdsLeaked === true, 'No internal _tr_id was leaked in headers or payload');
  assert(validation.leadingZerosPreserved === true, 'Leading zeroes preserved in zip and acct');
  assert(csvString.includes('"07030"'), 'ZIP 07030 is quoted as string');
  assert(csvString.includes('"00456"'), 'Account 00456 is quoted as string');

  // 2. Corrupt / row count mismatch detection
  const corruptCsvMissingRow = `id,name,zip,acct\n"101","Alice","07030","00456"`;
  const mismatchVal = validateCsvExport(corruptCsvMissingRow, 2, headers);
  assert(mismatchVal.isValid === false, 'Row count mismatch detected and flagged as invalid');
  assert(
    mismatchVal.errors.some((e) => e.includes('Export row count mismatch')),
    'Reports row count mismatch error'
  );

  // 3. Internal ID leakage detection
  const leakedIdCsv = `id,name,zip,acct,_tr_id\n"101","Alice","07030","00456","tr_row_1"`;
  const leakedVal = validateCsvExport(leakedIdCsv, 1, headers);
  assert(leakedVal.isValid === false, 'Leaked _tr_id detected in CSV and flagged as invalid');
  assert(leakedVal.noInternalIdsLeaked === false, 'noInternalIdsLeaked is false');

  // 4. Header count mismatch detection
  const missingColCsv = `id,name,zip\n"101","Alice","07030"`;
  const missingColVal = validateCsvExport(missingColCsv, 1, headers);
  assert(missingColVal.isValid === false, 'Missing column detected and flagged as invalid');

  return { suite: 'P1 Export Validation & Round-Trip Fidelity', passed, failed, errors };
}
