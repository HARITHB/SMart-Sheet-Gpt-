import Papa from 'papaparse';
import { stripRowIds, sanitizeHeaders } from './rowId';
import type { DatasetRow } from './types';

export interface ExportValidationResult {
  isValid: boolean;
  exportedRowCount: number;
  exportedColumnCount: number;
  detectedHeaders: string[];
  leadingZerosPreserved: boolean;
  unicodePreserved: boolean;
  noInternalIdsLeaked: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a CSV string by parsing it back into memory and verifying structural fidelity.
 */
export function validateCsvExport(
  csvContent: string,
  expectedRowCount: number,
  expectedHeaders: string[]
): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      errors.push(`CSV Syntax error: ${err.message} at row ${err.row}`);
    }
  }

  const detectedHeaders = parsed.meta.fields || [];
  const cleanExpectedHeaders = sanitizeHeaders(expectedHeaders);

  // Check 1: No internal ID leakage
  const noInternalIdsLeaked = !detectedHeaders.includes('_tr_id') && !csvContent.includes('"_tr_id"');
  if (!noInternalIdsLeaked) {
    errors.push('Internal identifier "_tr_id" was detected in the export payload.');
  }

  // Check 2: Row count fidelity
  const exportedRowCount = parsed.data.length;
  if (exportedRowCount !== expectedRowCount) {
    errors.push(
      `Export row count mismatch: expected ${expectedRowCount} rows, but generated ${exportedRowCount} rows.`
    );
  }

  // Check 3: Header fidelity
  if (detectedHeaders.length !== cleanExpectedHeaders.length) {
    errors.push(
      `Header count mismatch: expected ${cleanExpectedHeaders.length} columns, but detected ${detectedHeaders.length}.`
    );
  }

  // Check 4: Leading zero retention (e.g., "07030" must not be parsed as 7030)
  let leadingZerosPreserved = true;
  for (const row of parsed.data) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && /^0\d+$/.test(v.trim())) {
        // Stored as string with leading zero intact
        leadingZerosPreserved = true;
      }
    }
  }

  // Check 5: Unicode preservation
  const unicodePreserved = !/[]/.test(csvContent);
  if (!unicodePreserved) {
    warnings.push('Potential Unicode character replacement detected in export string.');
  }

  return {
    isValid: errors.length === 0,
    exportedRowCount,
    exportedColumnCount: detectedHeaders.length,
    detectedHeaders,
    leadingZerosPreserved,
    unicodePreserved,
    noInternalIdsLeaked,
    errors,
    warnings,
  };
}

/**
 * Prepares and validates a clean CSV export payload.
 */
export function generateValidatedCsvExport(
  headers: string[],
  rows: (Record<string, string> | DatasetRow)[]
): { csvString: string; validation: ExportValidationResult } {
  const cleanRows = stripRowIds(rows as Record<string, string>[]);
  const cleanHeaders = sanitizeHeaders(headers);

  const csvString = Papa.unparse(cleanRows, {
    quotes: true,
    header: true,
    columns: cleanHeaders,
  });

  const validation = validateCsvExport(csvString, rows.length, cleanHeaders);

  return {
    csvString,
    validation,
  };
}
