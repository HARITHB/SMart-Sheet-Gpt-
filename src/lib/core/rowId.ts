import type { DatasetRow, RowId } from './types';

let nextIdCounter = 1;

export function generateRowId(index?: number): RowId {
  if (index !== undefined) {
    return `tr_row_${index + 1}`;
  }
  return `tr_row_${nextIdCounter++}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Attaches a stable, immutable `_tr_id` to every ingested row.
 * Preserves existing `_tr_id` if already present.
 */
export function attachRowIds(rows: Record<string, string>[]): DatasetRow[] {
  return rows.map((row, idx) => {
    const existingId = (row as any)._tr_id;
    const cleanRow = { ...row };
    delete (cleanRow as any)._tr_id;
    return {
      ...cleanRow,
      _tr_id: existingId || generateRowId(idx),
    };
  });
}

/**
 * Strips the internal `_tr_id` property from rows for clean user-facing CSV/Excel exports.
 */
export function stripRowIds(rows: (DatasetRow | Record<string, string>)[]): Record<string, string>[] {
  return rows.map((row) => {
    const copy = { ...row };
    delete (copy as any)._tr_id;
    return copy as Record<string, string>;
  });
}

/**
 * Strips `_tr_id` from a header list if present.
 */
export function sanitizeHeaders(headers: string[]): string[] {
  return headers.filter((h) => h !== '_tr_id');
}
