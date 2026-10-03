import Papa from 'papaparse';

export interface ChangeRecord {
  id: string;
  runId?: string;
  rowId?: string;
  rowNumber: number;
  column: string;
  before: string;
  after: string;
  rule: string;
  source: 'deterministic' | 'ai';
  confidence?: 'high' | 'medium' | 'review';
  reason?: string;
  timestamp: string;
}

export function generateChangeLog(
  headers: string[],
  originalRows: (Record<string, string> & { _tr_id?: string })[],
  currentRows: (Record<string, string> & { _tr_id?: string })[],
  appliedRulesDescription = 'Data cleanup'
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const now = new Date().toISOString();
  const cleanHeaders = headers.filter((h) => h !== '_tr_id');

  // Check if rows have stable _tr_id
  const hasRowIds = originalRows.length > 0 && originalRows[0]._tr_id !== undefined;

  if (hasRowIds) {
    // 1. Build map of original rows by stable row ID
    const origMap = new Map<string, { row: Record<string, string>; originalIndex: number }>();
    originalRows.forEach((r, idx) => {
      if (r._tr_id) {
        origMap.set(r._tr_id, { row: r, originalIndex: idx + 1 });
      }
    });

    const currentIdSet = new Set<string>();

    // 2. Identify cell changes on surviving rows
    for (const curr of currentRows) {
      const rowId = curr._tr_id;
      if (!rowId) continue;
      currentIdSet.add(rowId);

      const origEntry = origMap.get(rowId);
      if (!origEntry) continue;

      const orig = origEntry.row;
      const rowNum = origEntry.originalIndex;

      for (const h of cleanHeaders) {
        const b = orig[h] ?? '';
        const a = curr[h] ?? '';
        if (b !== a) {
          records.push({
            id: `chg_${rowId}_${h}_${records.length}`,
            rowId,
            rowNumber: rowNum,
            column: h,
            before: b,
            after: a,
            rule: appliedRulesDescription,
            source: 'deterministic',
            confidence: 'high',
            reason: b === '' ? 'Filled empty value' : 'Standardized formatting/casing',
            timestamp: now,
          });
        }
      }
    }

    // 3. Identify removed rows (e.g. duplicate elimination)
    const removedEntries: { rowId: string; rowNum: number; row: Record<string, string> }[] = [];
    origMap.forEach((entry, rowId) => {
      if (!currentIdSet.has(rowId)) {
        removedEntries.push({ rowId, rowNum: entry.originalIndex, row: entry.row });
      }
    });

    if (removedEntries.length > 0) {
      for (const rem of removedEntries) {
        records.push({
          id: `chg_dedup_${rem.rowId}`,
          rowId: rem.rowId,
          rowNumber: rem.rowNum,
          column: 'Record',
          before: Object.values(rem.row).filter(v => v !== rem.rowId).slice(0, 3).join(' | '),
          after: '[Removed duplicate row]',
          rule: 'Remove duplicate rows',
          source: 'deterministic',
          confidence: 'high',
          reason: 'Identified as duplicate record with identical normalized values',
          timestamp: now,
        });
      }
    }
  } else {
    // Fallback: positional comparison if rows lack stable IDs
    const minRows = Math.min(originalRows.length, currentRows.length);
    for (let i = 0; i < minRows; i++) {
      const orig = originalRows[i];
      const curr = currentRows[i];
      if (!orig || !curr) continue;

      for (const h of cleanHeaders) {
        const b = orig[h] ?? '';
        const a = curr[h] ?? '';
        if (b !== a) {
          records.push({
            id: `chg_${i}_${h}_${records.length}`,
            rowNumber: i + 1,
            column: h,
            before: b,
            after: a,
            rule: appliedRulesDescription,
            source: 'deterministic',
            confidence: 'high',
            reason: b === '' ? 'Filled empty value' : 'Standardized formatting/casing',
            timestamp: now,
          });
        }
      }
    }

    if (originalRows.length > currentRows.length) {
      const removedCount = originalRows.length - currentRows.length;
      records.push({
        id: `chg_dedup_${records.length}`,
        rowNumber: 0,
        column: 'All columns',
        before: `${originalRows.length} rows`,
        after: `${currentRows.length} rows`,
        rule: 'Remove duplicate rows',
        source: 'deterministic',
        confidence: 'high',
        reason: `Eliminated ${removedCount} duplicate row(s) with matching values across all columns`,
        timestamp: now,
      });
    }
  }

  return records;
}

export function formatChangeLogCsv(records: ChangeRecord[]): string {
  const exportData = records.map((r) => ({
    'Row ID': r.rowId || (r.rowNumber === 0 ? 'Dataset' : `Row #${r.rowNumber}`),
    'Row #': r.rowNumber === 0 ? 'Dataset' : r.rowNumber,
    'Column': r.column,
    'Original Value': r.before,
    'Cleaned Value': r.after,
    'Rule / Action': r.rule,
    'Source': r.source.toUpperCase(),
    'Confidence': r.confidence ? r.confidence.toUpperCase() : 'HIGH',
    'Reason': r.reason || '',
    'Timestamp': r.timestamp,
  }));

  return Papa.unparse(exportData, {
    quotes: true,
    header: true,
  });
}

export function exportChangeLogCsv(
  fileName: string,
  records: ChangeRecord[]
): void {
  const csvString = formatChangeLogCsv(records);

  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  link.setAttribute('download', `${baseName}_change_log.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
