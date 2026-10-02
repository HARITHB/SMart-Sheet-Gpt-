export interface MergeConfig {
  primaryKey: string;
  secondaryKey: string;
  joinType: 'full_outer' | 'left' | 'inner';
  conflictResolution: 'prefer_primary' | 'prefer_secondary' | 'combine';
}

export interface MergeResult {
  mergedHeaders: string[];
  mergedRows: Record<string, string>[];
  stats: {
    primaryRowCount: number;
    secondaryRowCount: number;
    matchedCount: number;
    primaryOnlyCount: number;
    secondaryOnlyCount: number;
    conflictCount: number;
    totalResultRows: number;
  };
  conflicts: {
    key: string;
    column: string;
    primaryValue: string;
    secondaryValue: string;
    resolvedValue: string;
  }[];
}

export function mergeDatasets(
  primaryHeaders: string[],
  primaryRows: Record<string, string>[],
  secondaryHeaders: string[],
  secondaryRows: Record<string, string>[],
  config: MergeConfig
): MergeResult {
  const { primaryKey, secondaryKey, joinType, conflictResolution } = config;

  // Build combined header list
  const headerSet = new Set<string>(primaryHeaders);
  secondaryHeaders.forEach((h) => {
    if (h !== secondaryKey) headerSet.add(h);
  });
  const mergedHeaders = Array.from(headerSet);

  // Index secondary rows by secondary key
  const secondaryMap = new Map<string, Record<string, string>>();
  const secondaryKeySet = new Set<string>();

  secondaryRows.forEach((row) => {
    const rawVal = (row[secondaryKey] ?? '').trim().toLowerCase();
    if (rawVal && rawVal !== 'null' && rawVal !== 'n/a') {
      secondaryMap.set(rawVal, row);
      secondaryKeySet.add(rawVal);
    }
  });

  const mergedRows: Record<string, string>[] = [];
  const conflicts: MergeResult['conflicts'] = [];
  const matchedSecondaryKeys = new Set<string>();
  let matchedCount = 0;
  let primaryOnlyCount = 0;

  // 1. Process Primary Rows
  primaryRows.forEach((pRow) => {
    const pKeyVal = (pRow[primaryKey] ?? '').trim().toLowerCase();
    const sRow = pKeyVal ? secondaryMap.get(pKeyVal) : undefined;

    if (sRow) {
      matchedCount++;
      matchedSecondaryKeys.add(pKeyVal);
      const combinedRow: Record<string, string> = { ...pRow };

      secondaryHeaders.forEach((sCol) => {
        if (sCol === secondaryKey) return;
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
      if (joinType === 'full_outer' || joinType === 'left') {
        const rowWithEmptySecondary: Record<string, string> = { ...pRow };
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
  if (joinType === 'full_outer') {
    secondaryRows.forEach((sRow) => {
      const sKeyVal = (sRow[secondaryKey] ?? '').trim().toLowerCase();
      if (!sKeyVal || !matchedSecondaryKeys.has(sKeyVal)) {
        secondaryOnlyCount++;
        const newRow: Record<string, string> = {};
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
      totalResultRows: mergedRows.length,
    },
    conflicts,
  };
}
