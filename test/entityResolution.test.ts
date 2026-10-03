import {
  resolveEntities,
  calculateSimilarity,
  normalizeEntityString,
} from '../src/lib/core/entityResolution';
import { attachRowIds } from '../src/lib/core/rowId';

export function runEntityResolutionTests(): {
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

  // 1. String similarity helper
  assert(calculateSimilarity('John Smith', 'John Smith') === 1.0, 'Identical strings have 1.0 similarity');
  assert(calculateSimilarity('Jonathan Smith', 'Johnathan Smith') > 0.85, 'Minor typo has > 0.85 similarity');
  assert(calculateSimilarity('Alice', 'Zebediah') < 0.2, 'Completely different strings have low similarity');

  // 2. Setup 5 distinct duplicate test rows
  const testRows = attachRowIds([
    // Group 1: Exact Duplicates
    { name: 'Alice Jenkins', email: 'alice@acme.com', city: 'Boston', phone: '555-0101' },
    { name: 'Alice Jenkins', email: 'alice@acme.com', city: 'Boston', phone: '555-0101' },

    // Group 2: Normalized Duplicates (differing casing & spacing)
    { name: '  bob smith  ', email: 'BOB@ACME.COM', city: 'New York', phone: '555-0102' },
    { name: 'Bob Smith', email: 'bob@acme.com', city: 'new york', phone: '555-0102' },

    // Group 3: Likely Same Entity (shared unique email, differing names/cities)
    { name: 'Charlie B.', email: 'charlie@acme.com', city: 'Chicago', phone: '555-0103' },
    { name: 'Charles Brown', email: 'charlie@acme.com', city: 'Austin', phone: '555-0103' },

    // Group 4: Fuzzy Duplicate (high name similarity, no shared key)
    { name: 'Katherine Johnson', email: 'kjohnson@nasa.gov', city: 'Hampton', phone: '555-0104' },
    { name: 'Catherine Johnson', email: 'cjohnson@space.org', city: 'Hampton', phone: '555-0105' },

    // Group 5: Distinct Record (no match)
    { name: 'David Miller', email: 'david@corp.com', city: 'Seattle', phone: '555-0106' },
  ]);

  const headers = ['name', 'email', 'city', 'phone'];
  const report = resolveEntities(headers, testRows);

  assert(report.totalRows === 9, 'Total rows analyzed is 9');
  assert(report.groups.length === 4, 'Identified 4 distinct resolution groups');

  // Check Category 1: Exact Duplicate
  const exactGrp = report.groups.find((g) => g.category === 'exact_duplicate');
  assert(exactGrp !== undefined, 'Found exact_duplicate group');
  assert(exactGrp?.safeToAutoMerge === true, 'Exact duplicate is safe to auto-merge');
  assert(exactGrp?.reviewRequired === false, 'Exact duplicate does not require manual review');

  // Check Category 2: Normalized Duplicate
  const normGrp = report.groups.find((g) => g.category === 'normalized_duplicate');
  assert(normGrp !== undefined, 'Found normalized_duplicate group');
  assert(normGrp?.safeToAutoMerge === true, 'Normalized duplicate is safe to auto-merge');
  assert(normGrp?.reviewRequired === false, 'Normalized duplicate does not require review');

  // Check Category 3: Likely Same Entity
  const sameEntityGrp = report.groups.find((g) => g.category === 'likely_same_entity');
  assert(sameEntityGrp !== undefined, 'Found likely_same_entity group');
  assert(sameEntityGrp?.safeToAutoMerge === false, 'Likely same entity requires manual review (blocked auto-merge)');
  assert(sameEntityGrp?.reviewRequired === true, 'Review required is true');
  assert((sameEntityGrp?.conflicts.length ?? 0) >= 2, 'Captured conflicts for differing name and city');
  assert(
    sameEntityGrp?.conflicts.some((c) => c.column === 'city' && c.survivorValue === 'Chicago' && c.candidateValue === 'Austin') === true,
    'Accurately captured conflicting city values'
  );

  // Check Category 4: Fuzzy Duplicate
  const fuzzyGrp = report.groups.find((g) => g.category === 'fuzzy_duplicate');
  assert(fuzzyGrp !== undefined, 'Found fuzzy_duplicate group');
  assert(fuzzyGrp?.safeToAutoMerge === false, 'Fuzzy duplicate is NOT auto-merged');
  assert(fuzzyGrp?.reviewRequired === true, 'Fuzzy duplicate requires review');
  assert(fuzzyGrp?.matchingFields.includes('name') === true, 'Matched on name column');

  return { suite: 'P1 Duplicate & Entity Resolution Tiers', passed, failed, errors };
}
