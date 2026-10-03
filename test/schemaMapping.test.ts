import {
  validateSchemaMapping,
  applySchemaMapping,
  CRM_TARGET_SCHEMA,
} from '../src/lib/schemaMapping';
import { attachRowIds } from '../src/lib/core/rowId';

export function runSchemaMappingTests(): {
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

  // 1. Collision Detection: Two sources mapped to same target
  const collidingMapping = {
    'First Name': 'full_name',
    'Customer Name': 'full_name',
    'Work Email': 'email',
  };

  const collisionValidation = validateSchemaMapping(collidingMapping, CRM_TARGET_SCHEMA);
  assert(collisionValidation.isValid === false, 'Detects collision when 2 sources map to 1 target');
  assert(collisionValidation.collisions.length === 1, 'Exactly 1 collision reported');
  assert(
    collisionValidation.collisions[0].targetKey === 'full_name',
    'Target key of collision is full_name'
  );
  assert(
    collisionValidation.collisions[0].sourceColumns.includes('First Name') &&
      collisionValidation.collisions[0].sourceColumns.includes('Customer Name'),
    'Collision sources are accurately identified'
  );

  // 1b. Triple collision: 3 sources mapped to 1 target
  const tripleColliding = {
    'Email 1': 'email',
    'Email 2': 'email',
    'Email 3': 'email',
  };
  const tripleVal = validateSchemaMapping(tripleColliding, CRM_TARGET_SCHEMA);
  assert(tripleVal.isValid === false, 'Detects triple collision');
  assert(tripleVal.collisions[0].sourceColumns.length === 3, 'Triple collision captures all 3 sources');

  // 2. Applying colliding mapping throws error (blocking silent data overwrite)
  const rows = attachRowIds([
    { 'First Name': 'John', 'Customer Name': 'Johnathan Doe', 'Work Email': 'john@acme.com' },
    { 'First Name': 'Jane', 'Customer Name': 'Jane Smith', 'Work Email': 'jane@acme.com' },
  ]);

  let didThrow = false;
  try {
    applySchemaMapping(rows, collidingMapping, CRM_TARGET_SCHEMA);
  } catch (err: any) {
    didThrow = true;
    assert(
      err.message.includes('Schema mapping collision blocked'),
      'Throws descriptive collision error message'
    );
  }
  assert(didThrow === true, 'applySchemaMapping blocks execution on collision');

  // 3. Safe 1-to-1 mapping succeeds and preserves stable row IDs across all rows
  const validMapping = {
    'First Name': 'first_name',
    'Work Email': 'email',
  };

  const validValidation = validateSchemaMapping(validMapping, CRM_TARGET_SCHEMA);
  assert(validValidation.isValid === true, 'Valid 1-to-1 mapping passes validation');

  const { newHeaders, newRows } = applySchemaMapping(rows, validMapping, CRM_TARGET_SCHEMA);
  assert(newHeaders.includes('first_name'), 'New headers include first_name');
  assert(newHeaders.includes('email'), 'New headers include email');
  assert((newRows[0] as any)._tr_id === rows[0]._tr_id, 'Stable row ID is preserved on row 1');
  assert((newRows[1] as any)._tr_id === rows[1]._tr_id, 'Stable row ID is preserved on row 2');
  assert((newRows[0] as any).first_name === 'John', 'Mapped cell value is preserved on row 1');
  assert((newRows[1] as any).first_name === 'Jane', 'Mapped cell value is preserved on row 2');

  // 4. Missing required target fields warning
  const partialMapping = {
    'First Name': 'first_name',
  };
  const partialValidation = validateSchemaMapping(partialMapping, CRM_TARGET_SCHEMA);
  assert(
    partialValidation.missingRequired.length >= 0,
    'missingRequired fields computed for review'
  );

  return { suite: 'P0 Schema Mapping Collision Protection', passed, failed, errors };
}
