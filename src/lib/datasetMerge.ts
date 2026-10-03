import type { RowId, StructuralChangeRecord } from './core/types';
import { generateRowId } from './core/rowId';

export interface MergeConfig {
  primaryKey: string;
  secondaryKey: string;
  joinType: 'full_outer' | 'left' | 'inner';
  conflictResolution: 'prefer_primary' | 'prefer_secondary' | 'combine';
  allowDuplicateKeys?: boolean;
}

export interface MergeConflict {
  key: string;
  column: string;
  primaryValue: string;
  secondaryValue: string;
  resolvedValue: string;
}

export interface MergeResult {
  mergedHeaders: string[];
  mergedRows: (Record<string, string> & { _tr_id?: RowId })[];
  stats: {
    primaryRowCount: number;
    secondaryRowCount: number;
    matchedCount: number;
    primaryOnlyCount: number;
    secondaryOnlyCount: number;
    conflictCount: number;
    duplicatePrimaryKeysCount: number;
    duplicateSecondaryKeysCount: number;
    totalResultRows: number;
  };
  conflicts: MergeConflict[];
  unmatchedPrimaryKeys: string[];
  unmatchedSecondaryKeys: string[];
  duplicateKeysDetected: {
    primaryDuplicates: string[];
    secondaryDuplicates: string[];
  };
  structuralChanges: StructuralChangeRecord[];
}

/**
 * Merges two datasets with explicit key validation, duplicate key detection,
 * conflict tracking, and row-count verification.
 */
export function mergeDatasets(
  primaryHeaders: string[],
  primaryRows: (Record<string, string> & { _tr_id?: RowId })[],
  secondaryHeaders: string[],
  secondaryRows: (Record<string, string> & { _tr_id?: RowId })[],
  config: MergeConfig
): MergeResult {
  const { primaryKey, secondaryKey, joinType, conflictResolution, allowDuplicateKeys = false } = config;

  // Validation 1: Require explicit join keys to exist in headers
  if (!primaryHeaders.includes(primaryKey)) {
    throw new Error(`Primary join key "${primaryKey}" does not exist in primary dataset headers.`);
  }
  if (!secondaryHeaders.includes(secondaryKey)) {
    throw new Error(`Secondary join key "${secondaryKey}" does not exist in secondary dataset headers.`);
  }

  // Validation 2: Duplicate key detection
  const primaryKeyCounts = new Map<string, number>();
  for (const r of primaryRows) {
    const k = (r[primaryKey] ?? '').trim().toLowerCase();
    if (k && k !== 'null' && k !== 'n/a') {
      primaryKeyCounts.set(k, (primaryKeyCounts.get(k) || 0) + 1);
    }
  }

  const secondaryKeyCounts = new Map<string, number>();
  for (const r of secondaryRows) {
    const k = (r[secondaryKey] ?? '').trim().toLowerCase();
    if (k && k !== 'null' && k !== 'n/a') {
      secondaryKeyCounts.set(k, (secondaryKeyCounts.get(k) || 0) + 1);
    }
  }

  const primaryDuplicates = Array.from(primaryKeyCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([key]) => key);

  const secondaryDuplicates = Array.from(secondaryKeyCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([key]) => key);

  // If duplicate keys exist and allowDuplicateKeys is false, block to prevent Cartesian explosion
  if (!allowDuplicateKeys && (primaryDuplicates.length > 0 || secondaryDuplicates.length > 0)) {
    const dupesMsg: string[] = [];
    if (primaryDuplicates.length > 0) {
      dupesMsg.push(`Primary dataset has ${primaryDuplicates.length} duplicate join key(s) (e.g. "${primaryDuplicates[0]}")`);
    }
    if (secondaryDuplicates.length > 0) {
      dupesMsg.push(`Secondary dataset has ${secondaryDuplicates.length} duplicate join key(s) (e.g. "${secondaryDuplicates[0]}")`);
    }
    throw new Error(`Merge blocked: Duplicate join keys detected which would cause accidental row multiplication. ${dupesMsg.join('; ')}.`);
  }

  // Build combined header list
  const headerSet = new Set<string>(primaryHeaders);
  secondaryHeaders.forEach((h) => {
    if (h !== secondaryKey && h !== '_tr_id') headerSet.add(h);
  });
  const mergedHeaders = Array.from(headerSet).filter((h) => h !== '_tr_id');

  // Index secondary rows by secondary key (taking first row per key if duplicates permitted)
  const secondaryMap = new Map<string, Record<string, string> & { _tr_id?: RowId }>();
  secondaryRows.forEach((row) => {
    const rawVal = (row[secondaryKey] ?? '').trim().toLowerCase();
    if (rawVal && rawVal !== 'null' && rawVal !== 'n/a' && !secondaryMap.has(rawVal)) {
      secondaryMap.set(rawVal, row);
    }
  });

  const mergedRows: (Record<string, string> & { _tr_id?: RowId })[] = [];
  const conflicts: MergeConflict[] = [];
  const matchedSecondaryKeys = new Set<string>();
  const unmatchedPrimaryKeys: string[] = [];
  let matchedCount = 0;
  let primaryOnlyCount = 0;
  let nextRowIdx = primaryRows.length + 1;

  // 1. Process Primary Rows
  primaryRows.forEach((pRow) => {
    const pKeyVal = (pRow[primaryKey] ?? '').trim().toLowerCase();
    const sRow = pKeyVal ? secondaryMap.get(pKeyVal) : undefined;

    if (sRow) {
      matchedCount++;
      matchedSecondaryKeys.add(pKeyVal);
      const combinedRow: Record<string, string> & { _tr_id?: RowId } = {
        ...pRow,
        _tr_id: pRow._tr_id || generateRowId(nextRowIdx++),
      };

      secondaryHeaders.forEach((sCol) => {
        if (sCol === secondaryKey || sCol === '_tr_id') return;
        const pVal = pRow[sCol];
        const sVal = sRow[sCol];

        if (pVal !== undefined && sVal !== undefined && pVal !== '' && sVal !== '' && pVal !== sVal) {
          // Conflict detected
          let resolvedVal = pVal;
          if (conflictResolution === 'prefer_secondary') resolvedVal = sVal;
          else if (conflictResolution === 'combine') resolvedVal = `${pVal} | ${sVal}`;

          conflicts.push({
            key: pKeyVal,
            column: sCol,
            primaryValue: pVal,
            secondaryValue: sVal,
            resolvedValue: resolvedVal,
          });
          combinedRow[sCol] = resolvedVal;
        } else if (pVal === undefined || pVal === '') {
          combinedRow[sCol] = sVal ?? '';
        }
      });

      mergedRows.push(combinedRow);
    } else {
      primaryOnlyCount++;
      if (pKeyVal) unmatchedPrimaryKeys.push(pKeyVal);

      if (joinType === 'full_outer' || joinType === 'left') {
        const rowWithEmptySecondary: Record<string, string> & { _tr_id?: RowId } = {
          ...pRow,
          _tr_id: pRow._tr_id || generateRowId(nextRowIdx++),
        };
        mergedHeaders.forEach((h) => {
          if (rowWithEmptySecondary[h] === undefined) {
            rowWithEmptySecondary[h] = '';
          }
        });
        mergedRows.push(rowWithEmptySecondary);
      }
    }
  });

  // 2. Process Secondary Only Rows (for full_outer)
  let secondaryOnlyCount = 0;
  const unmatchedSecondaryKeys: string[] = [];

  if (joinType === 'full_outer') {
    secondaryRows.forEach((sRow) => {
      const sKeyVal = (sRow[secondaryKey] ?? '').trim().toLowerCase();
      if (!sKeyVal || !matchedSecondaryKeys.has(sKeyVal)) {
        secondaryOnlyCount++;
        if (sKeyVal) unmatchedSecondaryKeys.push(sKeyVal);

        const newRow: Record<string, string> & { _tr_id?: RowId } = {
          _tr_id: generateRowId(nextRowIdx++),
        };
        mergedHeaders.forEach((h) => {
          if (h === primaryKey) {
            newRow[h] = sRow[secondaryKey] ?? '';
          } else {
            newRow[h] = sRow[h] ?? '';
          }
        });
        mergedRows.push(newRow);
      }
    });
  }

  // 3. Structural Change Records
  const now = new Date().toISOString();
  const structuralChanges: StructuralChangeRecord[] = [
    {
      id: `str_merge_${Date.now()}`,
      runId: `run_merge_${Date.now()}`,
      type: 'row_merged',
      affectedRowIds: mergedRows.map((r) => r._tr_id || ''),
      reason: `Merged ${primaryRows.length} primary rows with ${secondaryRows.length} secondary rows on keys "${primaryKey}" = "${secondaryKey}". Result: ${mergedRows.length} rows (${matchedCount} matched, ${conflicts.length} conflicts resolved).`,
      rule: `Dataset Merge (${joinType})`,
      timestamp: now,
    },
  ];

  return {
    mergedHeaders,
    mergedRows,
    stats: {
      primaryRowCount: primaryRows.length,
      secondaryRowCount: secondaryRows.length,
      matchedCount,
      primaryOnlyCount,
      secondaryOnlyCount,
      conflictCount: conflicts.length,
      duplicatePrimaryKeysCount: primaryDuplicates.length,
      duplicateSecondaryKeysCount: secondaryDuplicates.length,
      totalResultRows: mergedRows.length,
    },
    conflicts,
    unmatchedPrimaryKeys,
    unmatchedSecondaryKeys,
    duplicateKeysDetected: {
      primaryDuplicates,
      secondaryDuplicates,
    },
    structuralChanges,
  };
}
