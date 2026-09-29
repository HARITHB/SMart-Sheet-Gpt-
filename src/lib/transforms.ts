export type TransformRule =
  | 'uppercase'
  | 'lowercase'
  | 'titlecase'
  | 'extract_zip'
  | 'extract_email'
  | 'sentiment';

export const TRANSFORM_LABELS: Record<TransformRule, string> = {
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  titlecase: 'Title Case',
  extract_zip: 'Extract US Zip Code',
  extract_email: 'Extract Email Address',
  sentiment: 'Sentiment Analysis',
};

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str.replace(
    /\b[a-zA-Z]/g,
    (txt) => txt.toUpperCase()
  ).replace(
    /\B[a-zA-Z]+/g,
    (txt) => txt.toLowerCase()
  );
}

export function extractUsZipCode(str: string): string {
  if (!str) return '';
  // Matches 5-digit US ZIP or 9-digit ZIP+4 (e.g. 90210 or 90210-1234)
  const match = str.match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : '';
}

export function extractEmail(str: string): string {
  if (!str) return '';
  const match = str.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  return match ? match[0] : '';
}

export function transformColumn(
  rows: Record<string, string>[],
  columnName: string,
  rule: TransformRule
): Record<string, string>[] {
  return rows.map((row) => {
    const value = row[columnName] ?? '';
    let transformed = value;

    switch (rule) {
      case 'uppercase':
        transformed = value.toUpperCase();
        break;
      case 'lowercase':
        transformed = value.toLowerCase();
        break;
      case 'titlecase':
        transformed = toTitleCase(value);
        break;
      case 'extract_zip':
        transformed = extractUsZipCode(value);
        break;
      case 'extract_email':
        transformed = extractEmail(value);
        break;
      default:
        break;
    }

    return {
      ...row,
      [columnName]: transformed,
    };
  });
}
