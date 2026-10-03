import type { DatasetRow, DatasetVersion, InvariantViolation, ValidationResult, CleaningOperation } from './types';

// Patterns to detect sensitive ID columns
export const ID_COLUMN_PATTERN = /^(id|_id|order[-_\s]?id|lead[-_\s]?id|customer[-_\s]?id|uuid|sku|ref|account[-_\s]?id|txn[-_\s]?id|ticket[-_\s]?id)$/i;

// Patterns to detect monetary / financial values
export const MONETARY_PATTERN = /^[$€£¥₹]\s*\d+(?:\.\d+)?$|^\d+(?:\.\d+)?\s*[$€£¥₹]$/;

// Ambiguous date pattern: e.g. 03/04/2024 or 04/05/24 where both parts <= 12
export const AMBIGUOUS_DATE_PATTERN = /^(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|1[0-2])[\/\-](?:\d{4}|\d{2})$/;

/**
 * Validates dataset integrity invariants between a candidate state and its base version.
 * If any violation is found, returns valid: false with detailed violation descriptors.
 */
export function validateDatasetInvariants(
  baseVersion: DatasetVersion,
  candidateRows: DatasetRow[],
  candidateHeaders: string[],
  operations: CleaningOperation[] = []
): ValidationResult {
  const violations: InvariantViolation[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const baseHeaders = baseVersion.headers.filter((h) => h !== '_tr_id');
  const cleanCandidateHeaders = candidateHeaders.filter((h) => h !== '_tr_id');

  const toStr = (v: any): string => (typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v)));

  // Invariant 1: Row IDs must remain unique in candidate
  const seenRowIds = new Set<string>();
  for (const row of candidateRows) {
    if (!row._tr_id) {
      violations.push({
        code: 'DUPLICATE_ROW_ID',
        message: 'A candidate row has no internal row ID (_tr_id).',
        severity: 'error',
      });
      break;
    }
    if (seenRowIds.has(row._tr_id)) {
      violations.push({
        code: 'DUPLICATE_ROW_ID',
        message: `Duplicate row ID detected: ${row._tr_id}`,
        rowId: row._tr_id,
        severity: 'error',
      });
      break;
    }
    seenRowIds.add(row._tr_id);
  }

  // Invariant 2: Candidate row IDs must be a subset of base row IDs (no fabricated rows)
  const baseRowMap = new Map<string, DatasetRow>();
  for (const row of baseVersion.rows) {
    baseRowMap.set(row._tr_id, row);
  }

  for (const row of candidateRows) {
    if (!baseRowMap.has(row._tr_id)) {
      violations.push({
        code: 'FABRICATED_ROW',
        message: `Candidate row contains fabricated row ID (${row._tr_id}) not present in the base version.`,
        rowId: row._tr_id,
        severity: 'error',
      });
    }
  }

  // Invariant 3: Value type integrity (No non-strings, nulls, undefined, or [object Object])
  for (const row of candidateRows) {
    for (const col of cleanCandidateHeaders) {
      const val = row[col] as any;
      if (typeof val !== 'string') {
        violations.push({
          code: 'WRONG_VALUE_TYPE',
          message: `Row ${row._tr_id} column "${col}" has invalid type "${typeof val}". All cell values must be strings.`,
          rowId: row._tr_id,
          column: col,
          afterValue: String(val),
          severity: 'error',
        });
      } else if (val === '[object Object]' || val === 'undefined' || val === 'NaN') {
        violations.push({
          code: 'WRONG_VALUE_TYPE',
          message: `Row ${row._tr_id} column "${col}" contains corrupted serialized value "${val}".`,
          rowId: row._tr_id,
          column: col,
          afterValue: val,
          severity: 'error',
        });
      }
    }
  }

  // Invariant 4: Sensitive identifier preservation
  // Check all columns that match ID patterns
  const idColumns = baseHeaders.filter((h) => ID_COLUMN_PATTERN.test(h));
  for (const row of candidateRows) {
    const baseRow = baseRowMap.get(row._tr_id);
    if (!baseRow) continue;

    for (const col of idColumns) {
      const origVal = toStr(baseRow[col]).trim();
      const candVal = toStr(row[col]).trim();

      // If an ID was modified, verify if any operation was explicitly targeted and permitted
      if (origVal !== '' && origVal !== candVal) {
        violations.push({
          code: 'ID_MUTATED',
          message: `Protected ID column "${col}" was mutated from "${origVal}" to "${candVal}". Identifiers must not be silently modified.`,
          rowId: row._tr_id,
          column: col,
          beforeValue: origVal,
          afterValue: candVal,
          severity: 'error',
        });
      }
    }
  }

  // Invariant 5: Leading zero preservation on numeric strings & postal codes
  // E.g. "07030" or "0123" must not become "7030" or "123"
  for (const row of candidateRows) {
    const baseRow = baseRowMap.get(row._tr_id);
    if (!baseRow) continue;

    for (const col of baseHeaders) {
      const origVal = toStr(baseRow[col]);
      const candVal = toStr(row[col]);

      // Check if original had leading zero and was purely digits
      if (/^0\d+$/.test(origVal.trim())) {
        // If candidate stripped the leading zero e.g. "07030" -> "7030"
        if (/^[1-9]\d*$/.test(candVal.trim()) && origVal.trim().endsWith(candVal.trim())) {
          violations.push({
            code: 'LEADING_ZERO_STRIPPED',
            message: `Leading zero was stripped in column "${col}" for row ${row._tr_id}. Value changed from "${origVal}" to "${candVal}".`,
            rowId: row._tr_id,
            column: col,
            beforeValue: origVal,
            afterValue: candVal,
            severity: 'error',
          });
        }
      }
    }
  }

  // Invariant 6: Monetary values must not have their numeric value altered
  for (const row of candidateRows) {
    const baseRow = baseRowMap.get(row._tr_id);
    if (!baseRow) continue;

    for (const col of baseHeaders) {
      const origVal = toStr(baseRow[col]).trim();
      const candVal = toStr(row[col]).trim();

      if (MONETARY_PATTERN.test(origVal)) {
        // Extract numeric digits and decimals
        const origNum = origVal.replace(/[^0-9.]/g, '');
        const candNum = candVal.replace(/[^0-9.]/g, '');

        if (origNum !== candNum && candNum !== '') {
          violations.push({
            code: 'MONETARY_VALUE_ALTERED',
            message: `Monetary value in column "${col}" was altered from "${origVal}" to "${candVal}". Financial amounts must not be modified.`,
            rowId: row._tr_id,
            column: col,
            beforeValue: origVal,
            afterValue: candVal,
            severity: 'error',
          });
        }
      }
    }
  }

  // Invariant 7: Undeclared column changes
  // Verify that candidate does not drop columns without a schema_mapping operation
  const hasSchemaMapping = operations.some((op) => op.type === 'schema_mapping');
  if (!hasSchemaMapping) {
    for (const h of baseHeaders) {
      if (!cleanCandidateHeaders.includes(h)) {
        violations.push({
          code: 'UNDECLARED_COLUMN',
          message: `Column "${h}" was unexpectedly dropped from candidate dataset.`,
          column: h,
          severity: 'error',
        });
      }
    }

    // Check for unexpected unknown columns in candidate
    for (const h of cleanCandidateHeaders) {
      if (!baseHeaders.includes(h)) {
        violations.push({
          code: 'UNKNOWN_COLUMN',
          message: `Candidate dataset contains undeclared unknown column "${h}".`,
          column: h,
          severity: 'error',
        });
      }
    }
  }

  // Invariant 8: Operation target column validation & conflict detection
  const opValidation = validateOperations(operations, baseHeaders);
  if (!opValidation.valid) {
    violations.push(...opValidation.violations);
  }

  // Compile errors and warnings
  for (const v of violations) {
    if (v.severity === 'error') {
      errors.push(v.message);
    } else {
      warnings.push(v.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    violations,
  };
}

/**
 * Validates cleaning operations for unknown target columns and conflicting instructions.
 */
export function validateOperations(
  operations: CleaningOperation[],
  availableHeaders: string[]
): ValidationResult {
  const violations: InvariantViolation[] = [];
  const errors: string[] = [];
  const cleanHeaders = availableHeaders.filter((h) => h !== '_tr_id');

  // 1. Check for unknown target columns (except for schema_mapping or sentiment which may introduce new columns)
  for (const op of operations) {
    if (op.type === 'schema_mapping') continue;
    for (const col of op.targetColumns) {
      if (!cleanHeaders.includes(col)) {
        violations.push({
          code: 'UNKNOWN_COLUMN',
          message: `Operation "${op.operationId}" (${op.type}) targets unknown column "${col}". Column does not exist in dataset.`,
          column: col,
          severity: 'error',
        });
      }
    }
  }

  // 2. Conflict detection: check for mutually conflicting operations on the same column in a single run
  // E.g., uppercase vs lowercase, uppercase vs titlecase, etc.
  const casingTypes = new Set(['uppercase', 'lowercase', 'titlecase']);
  const columnCasingOps = new Map<string, CleaningOperation[]>();

  for (const op of operations) {
    if (casingTypes.has(op.type)) {
      for (const col of op.targetColumns) {
        const existing = columnCasingOps.get(col) || [];
        existing.push(op);
        columnCasingOps.set(col, existing);
      }
    }
  }

  for (const [col, ops] of columnCasingOps.entries()) {
    if (ops.length > 1) {
      const distinctTypes = new Set(ops.map((o) => o.type));
      if (distinctTypes.size > 1) {
        violations.push({
          code: 'CONFLICTING_OPERATIONS',
          message: `Conflicting casing operations detected for column "${col}": ${Array.from(distinctTypes).join(', ')}. Conflicting operations cannot be executed atomically in the same run.`,
          column: col,
          severity: 'error',
        });
      }
    }
  }

  for (const v of violations) {
    errors.push(v.message);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    violations,
  };
}

/**
 * Validates raw AI batch cleaning responses for integrity and structure.
 */
export function validateAiCleanResponse(
  rawResponse: any,
  expectedColumns: string[],
  expectedRowCount: number
): { valid: boolean; error?: string; cleanedMap?: Record<string, string[]> } {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { valid: false, error: 'Malformed AI response: response is not an object.' };
  }

  if (!Array.isArray(rawResponse.columns)) {
    return { valid: false, error: 'Malformed AI response: missing or invalid "columns" array.' };
  }

  const cleanedMap: Record<string, string[]> = {};
  const returnedHeaders = new Set<string>();

  for (const col of rawResponse.columns) {
    if (!col || typeof col !== 'object') {
      return { valid: false, error: 'Malformed AI response: invalid column object.' };
    }
    if (typeof col.header !== 'string' || !col.header.trim()) {
      return { valid: false, error: 'Malformed AI response: column header must be a non-empty string.' };
    }
    if (!expectedColumns.includes(col.header)) {
      return { valid: false, error: `Malformed AI response: received unexpected/unknown column "${col.header}".` };
    }
    if (!Array.isArray(col.values)) {
      return { valid: false, error: `Malformed AI response: values for column "${col.header}" is not an array.` };
    }
    if (col.values.length !== expectedRowCount) {
      return {
        valid: false,
        error: `Malformed AI response: column "${col.header}" returned ${col.values.length} values, expected exactly ${expectedRowCount}.`,
      };
    }

    const safeValues: string[] = [];
    for (let i = 0; i < col.values.length; i++) {
      const v = col.values[i];
      if (v === null || v === undefined) {
        safeValues.push('');
      } else if (typeof v === 'object') {
        return {
          valid: false,
          error: `Malformed AI response: row index ${i} in column "${col.header}" returned an invalid nested object.`,
        };
      } else {
        safeValues.push(String(v));
      }
    }

    cleanedMap[col.header] = safeValues;
    returnedHeaders.add(col.header);
  }

  // Ensure all requested columns were returned
  for (const exp of expectedColumns) {
    if (!returnedHeaders.has(exp)) {
      return { valid: false, error: `Malformed AI response: missing requested column "${exp}".` };
    }
  }

  return { valid: true, cleanedMap };
}

/**
 * Validates raw AI sentiment responses for integrity and structure.
 */
export function validateAiSentimentResponse(
  rawResponse: any,
  expectedRowCount: number
): { valid: boolean; error?: string; values?: ('Positive' | 'Neutral' | 'Negative')[] } {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { valid: false, error: 'Malformed AI response: response is not an object.' };
  }

  const rawValues = rawResponse.values ?? rawResponse.sentiments ?? (Array.isArray(rawResponse) ? rawResponse : null);
  if (!Array.isArray(rawValues)) {
    return { valid: false, error: 'Malformed AI response: missing or invalid "values" array.' };
  }

  if (rawValues.length !== expectedRowCount) {
    return {
      valid: false,
      error: `Malformed AI response: returned ${rawValues.length} sentiment values, expected ${expectedRowCount}.`,
    };
  }

  const validSentiments = new Set(['Positive', 'Neutral', 'Negative']);
  const sanitized: ('Positive' | 'Neutral' | 'Negative')[] = [];

  for (let i = 0; i < rawValues.length; i++) {
    const val = rawValues[i];
    if (typeof val === 'string' && validSentiments.has(val)) {
      sanitized.push(val as any);
    } else if (val && typeof val === 'object' && val.sentiment && validSentiments.has(val.sentiment)) {
      sanitized.push(val.sentiment);
    } else {
      sanitized.push('Neutral');
    }
  }

  return { valid: true, values: sanitized };
}
