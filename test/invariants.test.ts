import { createInitialVersion } from '../src/lib/core/transaction';
import {
  validateDatasetInvariants,
  validateOperations,
  validateAiCleanResponse,
  validateAiSentimentResponse,
} from '../src/lib/core/invariants';
import type { DatasetRow, CleaningOperation } from '../src/lib/core/types';

export function runInvariantsTests(): { suite: string; passed: number; failed: number; errors: string[] } {
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

  // 1. Initial version creation assigns unique stable row IDs
  const initial = createInitialVersion(
    'test.csv',
    ['id', 'name', 'zip', 'amount'],
    [
      { id: 'ID-1', name: 'Alice', zip: '07030', amount: '$50.00' },
      { id: 'ID-2', name: 'Bob', zip: '02138', amount: '$75.00' },
    ]
  );

  assert(initial.rows.length === 2, 'Initial version has 2 rows');
  assert(initial.rows[0]._tr_id === 'tr_row_1', 'Row 1 has stable row ID tr_row_1');
  assert(initial.rows[1]._tr_id === 'tr_row_2', 'Row 2 has stable row ID tr_row_2');

  // 2. Invariant: Valid transformation passes validation
  const validCandidate: DatasetRow[] = initial.rows.map((r) => ({
    ...r,
    name: r.name.toUpperCase(),
  }));
  const validResult = validateDatasetInvariants(initial, validCandidate, initial.headers);
  assert(validResult.valid === true, 'Safe uppercase transformation passes invariant validation');

  // 3. Invariant: Protected ID column mutation is blocked
  const idMutatedCandidate: DatasetRow[] = initial.rows.map((r) => ({
    ...r,
    id: r.id === 'ID-1' ? 'MUTATED-ID' : r.id,
  }));
  const idMutatedResult = validateDatasetInvariants(initial, idMutatedCandidate, initial.headers);
  assert(idMutatedResult.valid === false, 'Mutation of protected ID column is blocked');
  assert(
    idMutatedResult.violations.some((v) => v.code === 'ID_MUTATED'),
    'Reports ID_MUTATED violation'
  );

  // 4. Invariant: Stripping leading zeroes on numeric strings/ZIPs is blocked
  const zeroStrippedCandidate: DatasetRow[] = initial.rows.map((r) => ({
    ...r,
    zip: r.zip === '07030' ? '7030' : r.zip,
  }));
  const zeroResult = validateDatasetInvariants(initial, zeroStrippedCandidate, initial.headers);
  assert(zeroResult.valid === false, 'Stripping leading zero from postal code is blocked');
  assert(
    zeroResult.violations.some((v) => v.code === 'LEADING_ZERO_STRIPPED'),
    'Reports LEADING_ZERO_STRIPPED violation'
  );

  // 4b. Leading zero preservation on other numeric codes (e.g. account numbers)
  const acctInitial = createInitialVersion(
    'accounts.csv',
    ['acct_code', 'name'],
    [{ acct_code: '00421', name: 'Corp' }]
  );
  const acctStripped = acctInitial.rows.map((r) => ({ ...r, acct_code: '421' }));
  const acctResult = validateDatasetInvariants(acctInitial, acctStripped, acctInitial.headers);
  assert(acctResult.valid === false, 'Stripping leading zeroes on numeric code 00421 -> 421 is blocked');
  assert(
    acctResult.violations.some((v) => v.code === 'LEADING_ZERO_STRIPPED'),
    'Reports LEADING_ZERO_STRIPPED on account code'
  );

  // 5. Invariant: Altering monetary amounts is blocked ($ and other currencies)
  const amountAlteredCandidate: DatasetRow[] = initial.rows.map((r) => ({
    ...r,
    amount: r.amount === '$50.00' ? '$999.00' : r.amount,
  }));
  const amountResult = validateDatasetInvariants(initial, amountAlteredCandidate, initial.headers);
  assert(amountResult.valid === false, 'Altering financial amounts is blocked');
  assert(
    amountResult.violations.some((v) => v.code === 'MONETARY_VALUE_ALTERED'),
    'Reports MONETARY_VALUE_ALTERED violation'
  );

  // 5b. Euro and Rupee monetary preservation
  const currencyInitial = createInitialVersion(
    'intl.csv',
    ['euro_price', 'inr_price'],
    [{ euro_price: '€120.50', inr_price: '₹4999' }]
  );
  const currencyAltered = currencyInitial.rows.map((r) => ({ ...r, euro_price: '€20.50' }));
  const currResult = validateDatasetInvariants(currencyInitial, currencyAltered, currencyInitial.headers);
  assert(currResult.valid === false, 'Altering € currency amount is blocked');
  assert(
    currResult.violations.some((v) => v.code === 'MONETARY_VALUE_ALTERED'),
    'Reports MONETARY_VALUE_ALTERED for Euro'
  );

  // 6. Invariant: Fabricated row injection is blocked
  const fabricatedCandidate: DatasetRow[] = [
    ...initial.rows,
    { id: 'ID-999', name: 'Fake', zip: '99999', amount: '$0.00', _tr_id: 'fake_injected_id' },
  ];
  const fabResult = validateDatasetInvariants(initial, fabricatedCandidate, initial.headers);
  assert(fabResult.valid === false, 'Injection of fabricated rows is blocked');
  assert(
    fabResult.violations.some((v) => v.code === 'FABRICATED_ROW'),
    'Reports FABRICATED_ROW violation'
  );

  // 7. Invariant: Unknown column targeting is blocked
  const unknownColOp: CleaningOperation = {
    operationId: 'op_unknown',
    type: 'uppercase',
    targetColumns: ['non_existent_column'],
    reason: 'Targeting column that does not exist',
    source: 'deterministic',
    confidence: 'high',
    deterministic: true,
    reviewRequired: false,
  };
  const opCheck = validateOperations([unknownColOp], initial.headers);
  assert(opCheck.valid === false, 'Operation targeting unknown column fails operation validation');
  assert(
    opCheck.violations.some((v) => v.code === 'UNKNOWN_COLUMN'),
    'Reports UNKNOWN_COLUMN violation on operation target'
  );

  // 7b. Candidate introducing unexpected unknown columns is blocked
  const unknownColCandidate: DatasetRow[] = initial.rows.map((r) => ({
    ...r,
    unexpected_injected_col: 'hack',
  }));
  const unkResult = validateDatasetInvariants(
    initial,
    unknownColCandidate,
    [...initial.headers, 'unexpected_injected_col']
  );
  assert(unkResult.valid === false, 'Undeclared unknown column in candidate is blocked');
  assert(
    unkResult.violations.some((v) => v.code === 'UNKNOWN_COLUMN'),
    'Reports UNKNOWN_COLUMN on candidate headers'
  );

  // 8. Invariant: Wrong value types (non-strings, objects, numbers) are blocked
  const wrongTypeCandidate: any[] = initial.rows.map((r, i) => ({
    ...r,
    name: i === 0 ? (12345 as any) : r.name, // Injected number instead of string
  }));
  const typeResult = validateDatasetInvariants(initial, wrongTypeCandidate, initial.headers);
  assert(typeResult.valid === false, 'Non-string numeric value in row cell is blocked');
  assert(
    typeResult.violations.some((v) => v.code === 'WRONG_VALUE_TYPE'),
    'Reports WRONG_VALUE_TYPE for non-string'
  );

  // 8b. Corrupted serialized values like [object Object] are blocked
  const objectCorruptedCandidate: DatasetRow[] = initial.rows.map((r, i) => ({
    ...r,
    name: i === 0 ? '[object Object]' : r.name,
  }));
  const objResult = validateDatasetInvariants(initial, objectCorruptedCandidate, initial.headers);
  assert(objResult.valid === false, 'Corrupted serialized [object Object] is blocked');
  assert(
    objResult.violations.some((v) => v.code === 'WRONG_VALUE_TYPE'),
    'Reports WRONG_VALUE_TYPE for [object Object]'
  );

  // 9. Invariant: Conflicting operations in the same run are detected and blocked
  const conflictingOps: CleaningOperation[] = [
    {
      operationId: 'op_upper',
      type: 'uppercase',
      targetColumns: ['name'],
      reason: 'Uppercase name',
      source: 'deterministic',
      confidence: 'high',
      deterministic: true,
      reviewRequired: false,
    },
    {
      operationId: 'op_lower',
      type: 'lowercase',
      targetColumns: ['name'],
      reason: 'Lowercase name',
      source: 'deterministic',
      confidence: 'high',
      deterministic: true,
      reviewRequired: false,
    },
  ];
  const conflictCheck = validateOperations(conflictingOps, initial.headers);
  assert(conflictCheck.valid === false, 'Mutually conflicting casing operations are blocked');
  assert(
    conflictCheck.violations.some((v) => v.code === 'CONFLICTING_OPERATIONS'),
    'Reports CONFLICTING_OPERATIONS violation'
  );

  // 10. Malformed AI clean response validation
  // 10a. Non-object or missing columns
  const malformed1 = validateAiCleanResponse(null, ['name'], 2);
  assert(malformed1.valid === false, 'Rejects null AI clean response');

  const malformed2 = validateAiCleanResponse({ notColumns: [] }, ['name'], 2);
  assert(malformed2.valid === false, 'Rejects response missing columns array');

  // 10b. Length mismatch between returned values and batch rows
  const malformedLength = validateAiCleanResponse(
    { columns: [{ header: 'name', values: ['OnlyOne'] }] },
    ['name'],
    2 // expected 2 rows
  );
  assert(malformedLength.valid === false, 'Rejects AI response with row count mismatch');
  assert(malformedLength.error?.includes('expected exactly 2') === true, 'Error explains count mismatch');

  // 10c. Unknown/unexpected column in AI response
  const malformedUnknownCol = validateAiCleanResponse(
    { columns: [{ header: 'invented_column', values: ['Val1', 'Val2'] }] },
    ['name'],
    2
  );
  assert(malformedUnknownCol.valid === false, 'Rejects unexpected column in AI response');

  // 10d. Nested object inside values array
  const malformedNestedObj = validateAiCleanResponse(
    { columns: [{ header: 'name', values: [{ nested: 'object' }, 'Val2'] }] },
    ['name'],
    2
  );
  assert(malformedNestedObj.valid === false, 'Rejects nested object inside values array');

  // 10e. Valid AI clean response passes
  const validAiClean = validateAiCleanResponse(
    { columns: [{ header: 'name', values: ['ALICE', 'BOB'] }] },
    ['name'],
    2
  );
  assert(validAiClean.valid === true, 'Valid AI clean response passes');
  assert(validAiClean.cleanedMap?.['name'][0] === 'ALICE', 'Cleaned values properly mapped');

  // 11. Malformed AI sentiment response validation
  const malformedSent1 = validateAiSentimentResponse('not-an-object', 2);
  assert(malformedSent1.valid === false, 'Rejects non-object sentiment response');

  const malformedSentCount = validateAiSentimentResponse({ values: ['Positive'] }, 2);
  assert(malformedSentCount.valid === false, 'Rejects sentiment response with count mismatch');

  const validSentiment = validateAiSentimentResponse({ values: ['Positive', 'Neutral'] }, 2);
  assert(validSentiment.valid === true, 'Valid sentiment response passes');
  assert(validSentiment.values?.[0] === 'Positive', 'Sentiment values sanitized');

  return { suite: 'P0 Invariants & Data Safety', passed, failed, errors };
}
