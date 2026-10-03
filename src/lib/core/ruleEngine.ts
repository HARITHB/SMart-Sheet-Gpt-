import type { DatasetRow, RowId, ChangeRecord } from './types';
import { normalizePhoneNumber, extractUsZipCode, toTitleCase } from '../transforms';
import { normalizeCanonicalValue } from '../canonicalDictionaries';
import { ID_COLUMN_PATTERN, MONETARY_PATTERN } from './invariants';

export type RuleCategory =
  | 'format'
  | 'required'
  | 'allowed_values'
  | 'range'
  | 'pattern'
  | 'canonical'
  | 'duplicate';

export interface QualityRule {
  ruleId: string;
  name: string;
  description: string;
  category: RuleCategory;
  targetColumns: string[];
  severity: 'critical' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'review';
  reviewRequired: boolean;
  condition: (val: string, row: DatasetRow, col: string) => boolean;
  action: (val: string, row: DatasetRow, col: string) => string;
  validate?: (before: string, after: string) => boolean;
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  rowsEvaluated: number;
  rowsAffected: number;
  updatedRows: DatasetRow[];
  changeRecords: ChangeRecord[];
}

/**
 * Standard Library of Deterministic Quality Rules
 */
export const STANDARD_RULES: Record<string, (columns: string[]) => QualityRule> = {
  trim_whitespace: (columns) => ({
    ruleId: 'rule_trim_whitespace',
    name: 'Trim & Collapse Whitespace',
    description: 'Removes leading/trailing whitespace and collapses multiple spaces.',
    category: 'format',
    targetColumns: columns,
    severity: 'info',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => val !== val.trim().replace(/\s+/g, ' '),
    action: (val) => val.trim().replace(/\s+/g, ' '),
  }),

  title_case_names: (columns) => ({
    ruleId: 'rule_title_case_names',
    name: 'Title Case Names',
    description: 'Capitalizes first letters of names while preserving hyphens and apostrophes.',
    category: 'format',
    targetColumns: columns,
    severity: 'info',
    confidence: 'high',
    reviewRequired: false,
    condition: (val, _, col) => !ID_COLUMN_PATTERN.test(col) && val.length > 0 && val !== toTitleCase(val),
    action: (val, _, col) => (ID_COLUMN_PATTERN.test(col) ? val : toTitleCase(val)),
  }),

  normalize_phone: (columns) => ({
    ruleId: 'rule_normalize_phone',
    name: 'Standardize Phone Numbers',
    description: 'Standardizes phone numbers into clean separators without altering digits.',
    category: 'format',
    targetColumns: columns,
    severity: 'warning',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => val.trim().length > 0 && val !== normalizePhoneNumber(val),
    action: (val) => normalizePhoneNumber(val),
  }),

  extract_zip: (columns) => ({
    ruleId: 'rule_extract_zip',
    name: 'Extract Postal / ZIP Code',
    description: 'Extracts 5-digit US postal code preserving leading zeroes.',
    category: 'format',
    targetColumns: columns,
    severity: 'warning',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => {
      const extracted = extractUsZipCode(val);
      return extracted !== '' && extracted !== val.trim();
    },
    action: (val) => extractUsZipCode(val) || val,
  }),

  fill_missing_explicit: (columns) => ({
    ruleId: 'rule_fill_missing_explicit',
    name: 'Standardize Missing Markers',
    description: 'Converts null, na, n/a, and "-" into explicit "—" missing marker.',
    category: 'required',
    targetColumns: columns,
    severity: 'info',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => {
      const lower = val.trim().toLowerCase();
      return lower === 'null' || lower === 'na' || lower === 'n/a' || lower === '-';
    },
    action: () => '—',
  }),

  canonical_city: (columns) => ({
    ruleId: 'rule_canonical_city',
    name: 'Canonical City Normalization',
    description: 'Normalizes common city spelling variations to standard names.',
    category: 'canonical',
    targetColumns: columns,
    severity: 'info',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => {
      const res = normalizeCanonicalValue(val, 'city');
      return res.changed && res.normalized !== val;
    },
    action: (val) => normalizeCanonicalValue(val, 'city').normalized,
  }),

  canonical_country: (columns) => ({
    ruleId: 'rule_canonical_country',
    name: 'Canonical Country Normalization',
    description: 'Normalizes country names and abbreviations to standard names.',
    category: 'canonical',
    targetColumns: columns,
    severity: 'info',
    confidence: 'high',
    reviewRequired: false,
    condition: (val) => {
      const res = normalizeCanonicalValue(val, 'country');
      return res.changed && res.normalized !== val;
    },
    action: (val) => normalizeCanonicalValue(val, 'country').normalized,
  }),
};

/**
 * Applies a QualityRule deterministically against rows, returning updated rows and change records.
 */
export function executeQualityRule(
  rows: DatasetRow[],
  rule: QualityRule,
  runId = `run_${Date.now()}`
): RuleExecutionResult {
  const updatedRows: DatasetRow[] = [];
  const changeRecords: ChangeRecord[] = [];
  let rowsAffected = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let rowWasModified = false;
    const modifiedRow = { ...row };

    for (const col of rule.targetColumns) {
      const originalValue = modifiedRow[col] ?? '';

      // Skip protected identifiers and financial amounts if rule tries to mutate casing
      if (ID_COLUMN_PATTERN.test(col) && rule.category === 'format') {
        continue;
      }
      if (MONETARY_PATTERN.test(originalValue) && rule.category === 'format' && rule.ruleId.includes('case')) {
        continue;
      }

      if (rule.condition(originalValue, row, col)) {
        const newValue = rule.action(originalValue, row, col);

        if (newValue !== originalValue) {
          modifiedRow[col] = newValue;
          rowWasModified = true;

          changeRecords.push({
            id: `chg_${rule.ruleId}_${row._tr_id}_${col}_${changeRecords.length}`,
            runId,
            rowId: row._tr_id,
            column: col,
            before: originalValue,
            after: newValue,
            rule: rule.name,
            source: 'deterministic',
            confidence: rule.confidence,
            reason: rule.description,
            timestamp: now,
          });
        }
      }
    }

    if (rowWasModified) {
      rowsAffected++;
    }
    updatedRows.push(modifiedRow);
  }

  return {
    ruleId: rule.ruleId,
    ruleName: rule.name,
    rowsEvaluated: rows.length,
    rowsAffected,
    updatedRows,
    changeRecords,
  };
}
