import * as XLSX from 'xlsx';

export interface ParsedSheetData {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  activeSheet: string;
}

/**
 * Parses an Excel (.xlsx, .xls) file using SheetJS (xlsx library).
 * Extracts headers, cleans whitespace, and returns standard Record<string, string>[] rows.
 */
export async function parseExcelFile(file: File): Promise<ParsedSheetData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The Excel workbook contains no sheets.');
  }

  const activeSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[activeSheet];

  // Convert worksheet to array of arrays
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (!rawData || rawData.length === 0) {
    throw new Error('The selected Excel sheet is empty.');
  }

  // First row is headers
  const rawHeaders = rawData[0] || [];
  const headers: string[] = rawHeaders.map((h: any, idx: number) => {
    const str = String(h ?? '').trim();
    return str || `Column_${idx + 1}`;
  });

  // Subsequent rows are data rows
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawData.length; r++) {
    const rowValues = rawData[r];
    if (!rowValues || rowValues.length === 0) continue;

    // Check if row has at least one non-empty value
    let hasContent = false;
    const rowObj: Record<string, string> = {};

    headers.forEach((h, colIdx) => {
      const val = rowValues[colIdx] !== undefined && rowValues[colIdx] !== null
        ? String(rowValues[colIdx]).trim()
        : '';
      rowObj[h] = val;
      if (val !== '') hasContent = true;
    });

    if (hasContent) {
      rows.push(rowObj);
    }
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    headers,
    rows,
    sheetNames: workbook.SheetNames,
    activeSheet,
  };
}

/**
 * Exports data rows to a real Microsoft Excel (.xlsx) file.
 */
export function exportToExcel(
  fileName: string,
  rows: Record<string, string>[],
  sheetName = 'Cleaned Data'
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const downloadName = `${baseName}_cleaned.xlsx`;

  XLSX.writeFile(workbook, downloadName);
}
