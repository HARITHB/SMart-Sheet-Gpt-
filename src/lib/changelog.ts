import Papa from 'papaparse';

export interface ChangeRecord {
  id: string;
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
  originalRows: Record<string, string>[],
  currentRows: Record<string, string>[],
  appliedRulesDescription = 'Data cleanup'
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  const minRows = Math.min(originalRows.length, currentRows.length);
  const now = new Date().toISOString();

  // 1. Detect modified cells in existing rows
  for (let i = 0; i < minRows; i++) {
    const orig = originalRows[i];
    const curr = currentRows[i];
    if (!orig || !curr) continue;

    for (const h of headers) {
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

  // 2. Detect removed rows (e.g. duplicate elimination)
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

  return records;
}

export function exportChangeLogCsv(
  fileName: string,
  records: ChangeRecord[]
): void {
  const exportData = records.map((r) => ({
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

  const csvString = Papa.unparse(exportData, {
    quotes: true,
    header: true,
  });

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
