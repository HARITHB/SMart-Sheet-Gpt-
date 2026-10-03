import {
  transformColumn,
  normalizePhoneNumber,
  extractUsZipCode,
  toTitleCase,
} from '../src/lib/transforms';
import { attachRowIds } from '../src/lib/core/rowId';

export function runTransformsTests(): {
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

  // 1. Phone Normalization
  assert(
    normalizePhoneNumber('+91 98765 43210') === '+919876543210',
    'Normalizes Indian phone with +91'
  );
  assert(
    normalizePhoneNumber('555-0192') === '555-0192',
    'Preserves 7-digit local number without inventing digits'
  );
  assert(
    normalizePhoneNumber('1234567890') === '(123) 456-7890',
    'Formats 10-digit US number'
  );

  // 2. ZIP code extraction preserving leading zero
  assert(
    extractUsZipCode('123 Main St, Boston MA 02138') === '02138',
    'Extracts US ZIP with leading zero (02138)'
  );
  assert(
    extractUsZipCode('Hoboken, NJ 07030-1234') === '07030-1234',
    'Extracts US ZIP+4 (07030-1234)'
  );

  // 3. Title Casing
  assert(
    toTitleCase("sarah o'connor") === "Sarah O'Connor",
    "Preserves apostrophes in O'Connor"
  );
  assert(
    toTitleCase('emily davis-clark') === 'Emily Davis-Clark',
    'Preserves hyphens in Davis-Clark'
  );

  // 4. Identifier Protection Guard in transformColumn
  const rowsWithIds = attachRowIds([
    { 'Order ID': 'ORD-9821a', 'Lead ID': 'LD-101', 'Customer Name': 'john doe', 'Price': '$49.99' },
  ]);

  const transformed = transformColumn(rowsWithIds, 'Order ID', 'titlecase');
  assert(
    transformed[0]['Order ID'] === 'ORD-9821a',
    'Primary identifier column "Order ID" is protected from casing alteration'
  );

  const leadTransformed = transformColumn(rowsWithIds, 'Lead ID', 'uppercase');
  assert(
    leadTransformed[0]['Lead ID'] === 'LD-101',
    'Protected Lead ID is unchanged'
  );

  const nameTransformed = transformColumn(rowsWithIds, 'Customer Name', 'titlecase');
  assert(
    nameTransformed[0]['Customer Name'] === 'John Doe',
    'Non-ID column "Customer Name" is properly title-cased'
  );

  // 5. Trim preserves leading zero on postal code
  const zipRows = attachRowIds([
    { 'Zip': '  07030  ', 'Code': '  00123  ' },
  ]);
  const trimmed = transformColumn(zipRows, 'Zip', 'trim');
  assert(trimmed[0]['Zip'] === '07030', 'Trim whitespace preserves leading zero in 07030');

  const trimmedCode = transformColumn(zipRows, 'Code', 'trim');
  assert(trimmedCode[0]['Code'] === '00123', 'Trim whitespace preserves multiple leading zeroes in 00123');

  // 6. Monetary values preserved through transforms
  const priceTransformed = transformColumn(rowsWithIds, 'Price', 'titlecase');
  assert(priceTransformed[0]['Price'] === '$49.99', 'Price is unchanged through titlecase');

  return { suite: 'P0 Deterministic Transforms & ID Protection', passed, failed, errors };
}
