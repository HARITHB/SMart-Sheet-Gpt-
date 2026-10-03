import { mergeDatasets } from '../src/lib/datasetMerge';
import { attachRowIds } from '../src/lib/core/rowId';

export function runDatasetMergeHardeningTests(): {
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

  const primaryRows = attachRowIds([
    { email: 'alice@acme.com', name: 'Alice Smith', tier: 'Pro' },
    { email: 'bob@acme.com', name: 'Bob Jones', tier: 'Free' },
    { email: 'charlie@acme.com', name: 'Charlie B', tier: 'Free' },
  ]);

  const secondaryRows = attachRowIds([
    { email_addr: 'alice@acme.com', phone: '555-0101', tier: 'Enterprise' },
    { email_addr: 'bob@acme.com', phone: '555-0102', tier: 'Free' },
    { email_addr: 'david@acme.com', phone: '555-0103', tier: 'Pro' },
  ]);

  const primaryHeaders = ['email', 'name', 'tier'];
  const secondaryHeaders = ['email_addr', 'phone', 'tier'];

  // 1. Missing join key validation throws error
  let missingKeyThrew = false;
  try {
    mergeDatasets(primaryHeaders, primaryRows, secondaryHeaders, secondaryRows, {
      primaryKey: 'non_existent_key',
      secondaryKey: 'email_addr',
      joinType: 'left',
      conflictResolution: 'prefer_primary',
    });
  } catch (err: any) {
    missingKeyThrew = true;
    assert(err.message.includes('does not exist in primary dataset headers'), 'Error explains missing key');
  }
  assert(missingKeyThrew === true, 'Merge throws error when primary join key is missing');

  // 2. Duplicate join key detection blocks accidental row multiplication
  const primaryWithDupes = attachRowIds([
    { email: 'alice@acme.com', name: 'Alice 1', tier: 'Pro' },
    { email: 'alice@acme.com', name: 'Alice 2', tier: 'Pro' }, // Duplicate key!
  ]);

  let dupeThrew = false;
  try {
    mergeDatasets(primaryHeaders, primaryWithDupes, secondaryHeaders, secondaryRows, {
      primaryKey: 'email',
      secondaryKey: 'email_addr',
      joinType: 'left',
      conflictResolution: 'prefer_primary',
    });
  } catch (err: any) {
    dupeThrew = true;
    assert(err.message.includes('Duplicate join keys detected'), 'Error mentions duplicate keys detected');
  }
  assert(dupeThrew === true, 'Duplicate join key blocks merge by default to avoid row explosion');

  // 3. Clean Left Join with conflict resolution
  const leftMerge = mergeDatasets(primaryHeaders, primaryRows, secondaryHeaders, secondaryRows, {
    primaryKey: 'email',
    secondaryKey: 'email_addr',
    joinType: 'left',
    conflictResolution: 'prefer_secondary', // Alice tier should become 'Enterprise'
  });

  assert(leftMerge.stats.matchedCount === 2, 'Matched 2 rows (Alice, Bob)');
  assert(leftMerge.stats.primaryOnlyCount === 1, '1 primary only row (Charlie)');
  assert(leftMerge.stats.totalResultRows === 3, 'Total left join rows is 3');
  assert(leftMerge.conflicts.length === 1, 'Detected 1 conflict on tier for Alice');
  assert(leftMerge.conflicts[0].resolvedValue === 'Enterprise', 'Conflict resolved using prefer_secondary');

  const aliceRow = leftMerge.mergedRows.find((r) => r.email === 'alice@acme.com');
  assert(aliceRow?.tier === 'Enterprise', 'Alice tier updated to Enterprise');
  assert(aliceRow?.phone === '555-0101', 'Alice received secondary phone');
  assert(aliceRow?._tr_id === primaryRows[0]._tr_id, 'Alice preserved primary stable row ID');

  // 4. Combine conflict resolution
  const combineMerge = mergeDatasets(primaryHeaders, primaryRows, secondaryHeaders, secondaryRows, {
    primaryKey: 'email',
    secondaryKey: 'email_addr',
    joinType: 'left',
    conflictResolution: 'combine',
  });
  const aliceCombined = combineMerge.mergedRows.find((r) => r.email === 'alice@acme.com');
  assert(aliceCombined?.tier === 'Pro | Enterprise', 'Conflict resolved with combine');

  // 5. Full outer join includes secondary only rows
  const fullMerge = mergeDatasets(primaryHeaders, primaryRows, secondaryHeaders, secondaryRows, {
    primaryKey: 'email',
    secondaryKey: 'email_addr',
    joinType: 'full_outer',
    conflictResolution: 'prefer_primary',
  });
  assert(fullMerge.stats.secondaryOnlyCount === 1, '1 secondary-only row (David)');
  assert(fullMerge.stats.totalResultRows === 4, 'Full outer result has 4 rows');
  assert(fullMerge.unmatchedSecondaryKeys.includes('david@acme.com'), 'David tracked as unmatched secondary');
  assert(fullMerge.structuralChanges.length === 1, 'Logged 1 structural merge record');

  return { suite: 'P1 Dataset Merge Hardening & Conflict Resolution', passed, failed, errors };
}
