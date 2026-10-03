import { normalizeCanonicalValue } from '@/lib/canonicalDictionaries';
import { ID_COLUMN_PATTERN } from '@/lib/core/invariants';

export type TransformRule =
  | 'trim'
  | 'uppercase'
  | 'lowercase'
  | 'titlecase'
  | 'normalize_phone'
  | 'extract_zip'
  | 'extract_email'
  | 'fill_missing'
  | 'normalize_city'
  | 'normalize_country'
  | 'normalize_company'
  | 'sentiment';

export const TRANSFORM_LABELS: Record<TransformRule, string> = {
  trim: 'Trim Whitespace',
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  titlecase: 'Title Case',
  normalize_phone: 'Normalize Phone (E.164)',
  extract_zip: 'Extract US Zip Code',
  extract_email: 'Extract Email Address',
  fill_missing: 'Fill Missing as "—"',
  normalize_city: 'Standardize City (Canonical)',
  normalize_country: 'Standardize Country (Canonical)',
  normalize_company: 'Standardize Company Suffixes',
  sentiment: 'Sentiment Analysis',
};

export function trimWhitespace(str: string): string {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

export function toTitleCase(str: string): string {
  if (!str) return '';
  // Support hyphenated names like Davis-Clark, and apostrophes like O'Connor
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-'/])\w/g, (txt) => txt.toUpperCase());
}

export function extractUsZipCode(str: string): string {
  if (!str) return '';
  // Matches 5-digit US ZIP or 9-digit ZIP+4 (e.g. 90210 or 90210-1234)
  const match = str.match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : '';
}

export function extractEmail(str: string): string {
  if (!str) return '';
  const match = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  return match ? match[0] : '';
}

export function normalizePhoneNumber(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();

  // If already starts with '+' country code (e.g. +91 98765 43210 -> +919876543210)
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    return `+${digits}`;
  }

  // 10-digit number e.g. 1234567890 or 555-0192
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  // Preserve original with cleaned spacing if ambiguous - never invent digits!
  return trimmed.replace(/\s+/g, ' ');
}

export function fillMissingPlaceholder(str: string, placeholder = '—'): string {
  if (!str) return placeholder;
  const lower = str.trim().toLowerCase();
  if (lower === '' || lower === 'null' || lower === 'na' || lower === 'n/a' || lower === '-' || lower === 'unknown') {
    return placeholder;
  }
  return str;
}

export function transformColumn<T extends Record<string, string>>(
  rows: T[],
  columnName: string,
  rule: TransformRule
): T[] {
  // Guard: Protect primary identifiers from casing modifications
  const isIdColumn = ID_COLUMN_PATTERN.test(columnName);
  if (isIdColumn && (rule === 'titlecase' || rule === 'lowercase' || rule === 'uppercase')) {
    // Return rows unchanged to strictly protect identifier integrity
    return rows;
  }

  return rows.map((row) => {
    const value = row[columnName] ?? '';
    let transformed = value;

    switch (rule) {
      case 'trim':
        transformed = trimWhitespace(value);
        break;
      case 'uppercase':
        transformed = value.toUpperCase();
        break;
      case 'lowercase':
        transformed = value.toLowerCase();
        break;
      case 'titlecase':
        transformed = toTitleCase(value);
        break;
      case 'normalize_phone':
        transformed = normalizePhoneNumber(value);
        break;
      case 'extract_zip':
        transformed = extractUsZipCode(value);
        break;
      case 'extract_email':
        transformed = extractEmail(value);
        break;
      case 'fill_missing':
        transformed = fillMissingPlaceholder(value);
        break;
      case 'normalize_city':
        transformed = normalizeCanonicalValue(value, 'city').normalized;
        break;
      case 'normalize_country':
        transformed = normalizeCanonicalValue(value, 'country').normalized;
        break;
      case 'normalize_company':
        transformed = normalizeCanonicalValue(value, 'company').normalized;
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
