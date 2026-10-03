import type { DatasetRow, RowId } from './types';

export type EntityMatchCategory =
  | 'exact_duplicate'
  | 'normalized_duplicate'
  | 'fuzzy_duplicate'
  | 'likely_same_entity'
  | 'unresolved_candidate';

export interface EntityConflict {
  column: string;
  survivorValue: string;
  candidateValue: string;
}

export interface EntityResolutionGroup {
  groupId: string;
  category: EntityMatchCategory;
  survivorRowId: RowId;
  matchedRowIds: RowId[];
  matchingFields: string[];
  confidence: 'high' | 'medium' | 'review';
  reason: string;
  reviewRequired: boolean;
  conflicts: EntityConflict[];
  safeToAutoMerge: boolean;
}

export interface EntityResolutionReport {
  totalRows: number;
  totalGroups: number;
  exactDuplicateCount: number;
  normalizedDuplicateCount: number;
  fuzzyDuplicateCount: number;
  likelySameEntityCount: number;
  unresolvedCount: number;
  groups: EntityResolutionGroup[];
  assessmentNotice: string;
}

/**
 * Normalizes text for comparison (lowercased, punctuation removed, excess whitespace collapsed).
 */
export function normalizeEntityString(val: string): string {
  return (val || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Calculates string similarity using Dice's bigram coefficient (fast & accurate for short names/strings).
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeEntityString(str1);
  const s2 = normalizeEntityString(str2);

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  let intersection = 0;
  for (const [bigram, count] of b1.entries()) {
    if (b2.has(bigram)) {
      intersection += Math.min(count, b2.get(bigram)!);
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total === 0 ? 0.0 : (2.0 * intersection) / total;
}

/**
 * Analyzes dataset rows and groups duplicate candidates into 5 discrete tiers:
 * 1. exact_duplicate
 * 2. normalized_duplicate
 * 3. fuzzy_duplicate
 * 4. likely_same_entity
 * 5. unresolved_candidate
 */
export function resolveEntities(
  headers: string[],
  rows: DatasetRow[]
): EntityResolutionReport {
  const cleanHeaders = headers.filter((h) => h !== '_tr_id');
  const groups: EntityResolutionGroup[] = [];

  const nameCols = cleanHeaders.filter((h) => /(name|customer|lead|contact)/i.test(h));
  const emailCols = cleanHeaders.filter((h) => /(email|mail)/i.test(h));
  const phoneCols = cleanHeaders.filter((h) => /(phone|tel|mobile)/i.test(h));

  const processed = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowA = rows[i];
    if (processed.has(rowA._tr_id)) continue;

    for (let j = i + 1; j < rows.length; j++) {
      const rowB = rows[j];
      if (processed.has(rowB._tr_id)) continue;

      // 1. Exact Match: identical across all columns
      let isExact = true;
      for (const h of cleanHeaders) {
        if ((rowA[h] ?? '') !== (rowB[h] ?? '')) {
          isExact = false;
          break;
        }
      }

      if (isExact) {
        groups.push({
          groupId: `ent_grp_${groups.length + 1}`,
          category: 'exact_duplicate',
          survivorRowId: rowA._tr_id,
          matchedRowIds: [rowA._tr_id, rowB._tr_id],
          matchingFields: cleanHeaders,
          confidence: 'high',
          reason: 'Identical values across all columns',
          reviewRequired: false,
          conflicts: [],
          safeToAutoMerge: true,
        });
        processed.add(rowB._tr_id);
        continue;
      }

      // 2. Normalized Match: identical after lowercasing & trimming
      let isNormalized = true;
      for (const h of cleanHeaders) {
        if (normalizeEntityString(rowA[h] ?? '') !== normalizeEntityString(rowB[h] ?? '')) {
          isNormalized = false;
          break;
        }
      }

      if (isNormalized) {
        groups.push({
          groupId: `ent_grp_${groups.length + 1}`,
          category: 'normalized_duplicate',
          survivorRowId: rowA._tr_id,
          matchedRowIds: [rowA._tr_id, rowB._tr_id],
          matchingFields: cleanHeaders,
          confidence: 'high',
          reason: 'Identical values after whitespace and casing normalization',
          reviewRequired: false,
          conflicts: [],
          safeToAutoMerge: true,
        });
        processed.add(rowB._tr_id);
        continue;
      }

      // 3. Likely Same Entity: matching email or phone with distinct/partial names
      let sharedKeyFound = false;
      const matchingFields: string[] = [];

      for (const eCol of emailCols) {
        const emailA = normalizeEntityString(rowA[eCol] ?? '');
        const emailB = normalizeEntityString(rowB[eCol] ?? '');
        if (emailA && emailA === emailB && emailA.includes('@')) {
          sharedKeyFound = true;
          matchingFields.push(eCol);
        }
      }

      if (!sharedKeyFound) {
        for (const pCol of phoneCols) {
          const pA = (rowA[pCol] ?? '').replace(/\D/g, '');
          const pB = (rowB[pCol] ?? '').replace(/\D/g, '');
          if (pA && pA.length >= 7 && pA === pB) {
            sharedKeyFound = true;
            matchingFields.push(pCol);
          }
        }
      }

      if (sharedKeyFound) {
        // Collect field conflicts
        const conflicts: EntityConflict[] = [];
        for (const h of cleanHeaders) {
          const valA = (rowA[h] ?? '').trim();
          const valB = (rowB[h] ?? '').trim();
          if (valA && valB && valA !== valB) {
            conflicts.push({
              column: h,
              survivorValue: valA,
              candidateValue: valB,
            });
          }
        }

        groups.push({
          groupId: `ent_grp_${groups.length + 1}`,
          category: 'likely_same_entity',
          survivorRowId: rowA._tr_id,
          matchedRowIds: [rowA._tr_id, rowB._tr_id],
          matchingFields,
          confidence: 'medium',
          reason: `Shared unique identifier (${matchingFields.join(', ')}) with differing field values`,
          reviewRequired: true,
          conflicts,
          safeToAutoMerge: false,
        });
        processed.add(rowB._tr_id);
        continue;
      }

      // 4. Fuzzy Duplicate: high text similarity in name or company
      let maxSim = 0;
      let matchedNameCol = '';
      for (const nCol of nameCols) {
        const valA = rowA[nCol] ?? '';
        const valB = rowB[nCol] ?? '';
        if (valA.length > 3 && valB.length > 3) {
          const sim = calculateSimilarity(valA, valB);
          if (sim > maxSim) {
            maxSim = sim;
            matchedNameCol = nCol;
          }
        }
      }

      if (maxSim >= 0.85) {
        const conflicts: EntityConflict[] = [];
        for (const h of cleanHeaders) {
          const valA = (rowA[h] ?? '').trim();
          const valB = (rowB[h] ?? '').trim();
          if (valA && valB && valA !== valB) {
            conflicts.push({
              column: h,
              survivorValue: valA,
              candidateValue: valB,
            });
          }
        }

        groups.push({
          groupId: `ent_grp_${groups.length + 1}`,
          category: 'fuzzy_duplicate',
          survivorRowId: rowA._tr_id,
          matchedRowIds: [rowA._tr_id, rowB._tr_id],
          matchingFields: [matchedNameCol],
          confidence: maxSim >= 0.95 ? 'medium' : 'review',
          reason: `High phonetic/text similarity (${Math.round(maxSim * 100)}%) on "${matchedNameCol}"`,
          reviewRequired: true,
          conflicts,
          safeToAutoMerge: false,
        });
        processed.add(rowB._tr_id);
        continue;
      }
    }
  }

  const exactCount = groups.filter((g) => g.category === 'exact_duplicate').length;
  const normCount = groups.filter((g) => g.category === 'normalized_duplicate').length;
  const fuzzyCount = groups.filter((g) => g.category === 'fuzzy_duplicate').length;
  const sameEntityCount = groups.filter((g) => g.category === 'likely_same_entity').length;
  const unresolvedCount = groups.filter((g) => g.category === 'unresolved_candidate').length;

  return {
    totalRows: rows.length,
    totalGroups: groups.length,
    exactDuplicateCount: exactCount,
    normalizedDuplicateCount: normCount,
    fuzzyDuplicateCount: fuzzyCount,
    likelySameEntityCount: sameEntityCount,
    unresolvedCount,
    groups,
    assessmentNotice:
      'Entity grouping is an automated assessment based on deterministic rules and phonetic similarity. Ambiguous matches require manual review.',
  };
}
