import type { DatasetVersion, DatasetRow, CleaningOperation } from './types';
import { ID_COLUMN_PATTERN, MONETARY_PATTERN, validateDatasetInvariants } from './invariants';

export interface PostCleanValidationResult {
  valid: boolean;
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;
  changedCellsCount: number;
  duplicatesBefore: number;
  duplicatesAfter: number;
  missingValuesBefore: number;
  missingValuesAfter: number;
  invalidEmailCount: number;
  invalidPhoneCount: number;
  typeViolationsCount: number;
  unresolvedIssuesCount: number;
  suspiciousChanges: {
    rowId: string;
    column: string;
    before: string;
    after: string;
    reason: string;
  }[];
  blockedChanges: string[];
  warnings: string[];
  summary: {
    changedSuccessfully: number;
    stillNeedsReview: number;
    blocked: number;
    notChanged: number;
  };
  assessmentNotice: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_REGEX = /^[\d\s\+\-\(\)\.]{7,25}$/;

/**
 * Validates a dataset version transition and generates a comprehensive post-clean report.
 * Does NOT claim "100% clean" or "guaranteed error-free".
 */
export function validatePostClean(
  baseVersion: DatasetVersion,
  currentVersion: DatasetVersion,
  operations: CleaningOperation[] = []
): PostCleanValidationResult {
  const baseRows = baseVersion.rows;
  const currentRows = currentVersion.rows;

  const baseHeaders = baseVersion.headers.filter((h) => h !== '_tr_id');
  const currentHeaders = currentVersion.headers.filter((h) => h !== '_tr_id');

  const baseRowMap = new Map<string, DatasetRow>();
  for (const r of baseRows) {
    baseRowMap.set(r._tr_id, r);
  }

  // 1. Cell change diffing & suspicious change detection
  let changedCellsCount = 0;
  const suspiciousChanges: PostCleanValidationResult['suspiciousChanges'] = [];
  let changedSuccessfully = 0;
  let stillNeedsReview = 0;

  for (const curRow of currentRows) {
    const baseRow = baseRowMap.get(curRow._tr_id);
    if (!baseRow) continue;

    for (const col of currentHeaders) {
      const b = (baseRow[col] ?? '').trim();
      const a = (curRow[col] ?? '').trim();

      if (b !== a) {
        changedCellsCount++;

        // Suspicious change detection:
        // a. Drastic length truncation (> 60% loss of length on non-whitespace)
        if (b.length > 10 && a.length > 0 && a.length < b.length * 0.4) {
          suspiciousChanges.push({
            rowId: curRow._tr_id,
            column: col,
            before: b,
            after: a,
            reason: 'Significant value truncation (> 60% length reduction)',
          });
          stillNeedsReview++;
        }
        // b. Value emptied unexpectedly
        else if (b !== '' && a === '') {
          suspiciousChanges.push({
            rowId: curRow._tr_id,
            column: col,
            before: b,
            after: a,
            reason: 'Cell was completely emptied',
          });
          stillNeedsReview++;
        }
        // c. Protected identifier modified
        else if (ID_COLUMN_PATTERN.test(col)) {
          suspiciousChanges.push({
            rowId: curRow._tr_id,
            column: col,
            before: b,
            after: a,
            reason: 'Primary identifier column was modified',
          });
          stillNeedsReview++;
        } else {
          changedSuccessfully++;
        }
      }
    }
  }

  // 2. Missing value counting
  let missingValuesBefore = 0;
  for (const r of baseRows) {
    for (const h of baseHeaders) {
      const val = (r[h] ?? '').trim();
      if (!val || val === '—' || val.toLowerCase() === 'null' || val.toLowerCase() === 'n/a') {
        missingValuesBefore++;
      }
    }
  }

  let missingValuesAfter = 0;
  for (const r of currentRows) {
    for (const h of currentHeaders) {
      const val = (r[h] ?? '').trim();
      if (!val || val === '—' || val.toLowerCase() === 'null' || val.toLowerCase() === 'n/a') {
        missingValuesAfter++;
      }
    }
  }

  // 3. Duplicate row counting
  const countDuplicates = (headers: string[], rows: DatasetRow[]): number => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const r of rows) {
      const sig = headers.map((h) => (r[h] ?? '').trim().toLowerCase()).join('||');
      if (seen.has(sig)) {
        dupes++;
      } else {
        seen.add(sig);
      }
    }
    return dupes;
  };

  const duplicatesBefore = countDuplicates(baseHeaders, baseRows);
  const duplicatesAfter = countDuplicates(currentHeaders, currentRows);

  // 4. Format validation (emails and phones)
  let invalidEmailCount = 0;
  let invalidPhoneCount = 0;

  for (const r of currentRows) {
    for (const h of currentHeaders) {
      const val = (r[h] ?? '').trim();
      if (!val || val === '—') continue;

      if (/(email|mail)/i.test(h)) {
        if (!EMAIL_REGEX.test(val)) {
          invalidEmailCount++;
        }
      } else if (/(phone|mobile|tel)/i.test(h)) {
        if (!PHONE_CHARS_REGEX.test(val) || val.replace(/\D/g, '').length < 7) {
          invalidPhoneCount++;
        }
      }
    }
  }

  // 5. Invariant validation checks
  const invariantCheck = validateDatasetInvariants(baseVersion, currentRows, currentHeaders, operations);
  const blockedChanges = invariantCheck.errors;
  const warnings = [...invariantCheck.warnings];

  if (duplicatesAfter > 0) {
    warnings.push(`${duplicatesAfter} duplicate rows still remain in current dataset.`);
  }
  if (invalidEmailCount > 0) {
    warnings.push(`${invalidEmailCount} email values do not match standard syntax.`);
  }

  const totalPossibleCells = currentRows.length * currentHeaders.length;
  const notChanged = Math.max(0, totalPossibleCells - changedCellsCount);

  return {
    valid: invariantCheck.valid,
    rowsBefore: baseRows.length,
    rowsAfter: currentRows.length,
    columnsBefore: baseHeaders.length,
    columnsAfter: currentHeaders.length,
    changedCellsCount,
    duplicatesBefore,
    duplicatesAfter,
    missingValuesBefore,
    missingValuesAfter,
    invalidEmailCount,
    invalidPhoneCount,
    typeViolationsCount: invariantCheck.violations.filter((v) => v.code === 'WRONG_VALUE_TYPE').length,
    unresolvedIssuesCount: suspiciousChanges.length + invalidEmailCount + invalidPhoneCount,
    suspiciousChanges,
    blockedChanges,
    warnings,
    summary: {
      changedSuccessfully,
      stillNeedsReview,
      blocked: blockedChanges.length,
      notChanged,
    },
    assessmentNotice:
      'Quality evaluation based on structural and heuristic checks. Not an absolute guarantee of domain correctness.',
  };
}
