import {
  STANDARD_RULES,
  executeQualityRule,
} from '../src/lib/core/ruleEngine';
import { attachRowIds } from '../src/lib/core/rowId';

export function runRuleEngineTests(): {
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

  const rawRows = attachRowIds([
    {
      'Order ID': 'ORD-9801',
      Name: '  sarah o\'connor  ',
      Phone: '1234567890',
      Zip: '123 Main, Boston MA 02138',
      City: 'NYC',
      Country: 'USA',
      Notes: 'null',
      Total: '$120.00',
    },
  ]);

  // 1. Trim & Collapse Whitespace Rule
  const trimRule = STANDARD_RULES.trim_whitespace(['Name']);
  const trimResult = executeQualityRule(rawRows, trimRule);
  assert(trimResult.rowsAffected === 1, 'Trim affected 1 row');
  assert(trimResult.updatedRows[0].Name === "sarah o'connor", 'Whitespace trimmed');
  assert(trimResult.changeRecords.length === 1, 'Generated 1 change record');
  assert(trimResult.changeRecords[0].rule === 'Trim & Collapse Whitespace', 'Rule name tracked');

  // 2. Title Case Names Rule (Preserves ID columns and apostrophes)
  const titleRule = STANDARD_RULES.title_case_names(['Name', 'Order ID']);
  const titleResult = executeQualityRule(trimResult.updatedRows, titleRule);
  assert(titleResult.updatedRows[0].Name === "Sarah O'Connor", 'Title case applied preserving apostrophe');
  assert(
    titleResult.updatedRows[0]['Order ID'] === 'ORD-9801',
    'Protected Order ID is unchanged by title casing rule'
  );

  // 3. Normalize Phone Rule
  const phoneRule = STANDARD_RULES.normalize_phone(['Phone']);
  const phoneResult = executeQualityRule(titleResult.updatedRows, phoneRule);
  assert(phoneResult.updatedRows[0].Phone === '(123) 456-7890', 'Phone normalized');

  // 4. Extract ZIP Rule
  const zipRule = STANDARD_RULES.extract_zip(['Zip']);
  const zipResult = executeQualityRule(phoneResult.updatedRows, zipRule);
  assert(zipResult.updatedRows[0].Zip === '02138', 'ZIP extracted preserving leading zero');

  // 5. Canonical City & Country Normalization
  const cityRule = STANDARD_RULES.canonical_city(['City']);
  const cityResult = executeQualityRule(zipResult.updatedRows, cityRule);
  assert(cityResult.updatedRows[0].City === 'New York', 'NYC normalized to New York');

  const countryRule = STANDARD_RULES.canonical_country(['Country']);
  const countryResult = executeQualityRule(cityResult.updatedRows, countryRule);
  assert(countryResult.updatedRows[0].Country === 'United States', 'USA normalized to United States');

  // 6. Fill Missing Rule
  const fillRule = STANDARD_RULES.fill_missing_explicit(['Notes']);
  const fillResult = executeQualityRule(countryResult.updatedRows, fillRule);
  assert(fillResult.updatedRows[0].Notes === '—', 'Placeholder "null" standardized to "—"');

  // 7. Monetary values unchanged through format rules
  const moneyRule = STANDARD_RULES.title_case_names(['Total']);
  const moneyResult = executeQualityRule(fillResult.updatedRows, moneyRule);
  assert(moneyResult.updatedRows[0].Total === '$120.00', 'Monetary amount preserved intact');

  return { suite: 'P1 Deterministic Quality Rule Engine', passed, failed, errors };
}
