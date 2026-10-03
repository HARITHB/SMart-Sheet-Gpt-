/**
 * SaaS Foundation: Security Baseline
 * Provides CSV/Excel formula injection sanitization, payload bounds checking,
 * PII detection & masking, and server/client authorization enforcement.
 */

import { AuthSession, Permission, authService } from './auth';

export interface SecurityPolicyConfig {
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
  sanitizeFormulas: boolean;
  detectPii: boolean;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  maxRows: 250_000,
  maxColumns: 200,
  maxCellLength: 32_768, // Excel max cell string length
  sanitizeFormulas: true,
  detectPii: true,
};

export interface PiiScanResult {
  hasPii: boolean;
  typesDetected: ('ssn' | 'credit_card' | 'email' | 'phone')[];
  findingsCount: number;
  flaggedColumns: string[];
}

export class SecurityViolationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityViolationError';
  }
}

/**
 * Characters that could trigger spreadsheet formula execution or DDE command injection
 */
const FORMULA_INJECTION_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitizes a single cell value to prevent CSV/Excel Formula Injection (CWE-1236).
 * Prepends a single quote (') if the value begins with a formula trigger character.
 */
export function sanitizeCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.length === 0) return '';

  const firstChar = str.charAt(0);
  if (FORMULA_INJECTION_CHARS.includes(firstChar)) {
    // If not already single-quote escaped
    return `'${str}`;
  }
  return str;
}

/**
 * Strips formula-escape quotes when reading back from raw sanitized input safely.
 */
export function desanitizeCellValue(val: string): string {
  if (val && val.length > 1 && val.charAt(0) === "'" && FORMULA_INJECTION_CHARS.includes(val.charAt(1))) {
    return val.slice(1);
  }
  return val;
}

/**
 * Sanitizes entire dataset rows to prevent formula injection attacks on export or display.
 */
export function sanitizeDatasetRows<T extends Record<string, string>>(
  rows: T[],
  headers: string[]
): T[] {
  return rows.map((row) => {
    const sanitized: Record<string, string> = { ...row };
    for (const h of headers) {
      if (h in sanitized && h !== '_tr_id') {
        sanitized[h] = sanitizeCellValue(sanitized[h]);
      }
    }
    return sanitized as T;
  });
}

/**
 * Checks dataset dimensions against configured maximum security bounds.
 */
export function validatePayloadBounds(
  headers: string[],
  rows: Record<string, string>[],
  policy: SecurityPolicyConfig = DEFAULT_SECURITY_POLICY
): void {
  if (headers.length > policy.maxColumns) {
    throw new SecurityViolationError(
      'COLUMN_LIMIT_EXCEEDED',
      `Dataset exceeds maximum permitted column count (${headers.length}/${policy.maxColumns})`
    );
  }

  if (rows.length > policy.maxRows) {
    throw new SecurityViolationError(
      'ROW_LIMIT_EXCEEDED',
      `Dataset exceeds maximum permitted row count (${rows.length}/${policy.maxRows})`
    );
  }

  // Sample check for cell string length in first 500 rows to prevent memory exhaustion
  const sampleRows = rows.slice(0, 500);
  for (let rIdx = 0; rIdx < sampleRows.length; rIdx++) {
    const row = sampleRows[rIdx];
    for (const h of headers) {
      const cell = row[h];
      if (typeof cell === 'string' && cell.length > policy.maxCellLength) {
        throw new SecurityViolationError(
          'CELL_LENGTH_EXCEEDED',
          `Cell at row ${rIdx + 1}, column '${h}' exceeds maximum string length of ${policy.maxCellLength} characters`
        );
      }
    }
  }
}

/**
 * Regex patterns for PII detection
 */
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[ -]?){3}\d{4}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/;

/**
 * Scans rows for Personally Identifiable Information (PII).
 */
export function scanDatasetForPii(
  headers: string[],
  rows: Record<string, string>[],
  sampleLimit = 300
): PiiScanResult {
  const typesDetected = new Set<'ssn' | 'credit_card' | 'email' | 'phone'>();
  const flaggedColumns = new Set<string>();
  let findingsCount = 0;

  const sample = rows.slice(0, sampleLimit);

  for (const h of headers) {
    if (h === '_tr_id') continue;
    let colHasPii = false;

    for (const row of sample) {
      const val = row[h];
      if (!val || typeof val !== 'string') continue;

      if (SSN_REGEX.test(val)) {
        typesDetected.add('ssn');
        colHasPii = true;
        findingsCount++;
      }
      if (CREDIT_CARD_REGEX.test(val)) {
        typesDetected.add('credit_card');
        colHasPii = true;
        findingsCount++;
      }
      if (EMAIL_REGEX.test(val)) {
        typesDetected.add('email');
        colHasPii = true;
        findingsCount++;
      }
      if (PHONE_REGEX.test(val)) {
        typesDetected.add('phone');
        colHasPii = true;
        findingsCount++;
      }
    }

    if (colHasPii) {
      flaggedColumns.add(h);
    }
  }

  return {
    hasPii: typesDetected.size > 0,
    typesDetected: Array.from(typesDetected),
    findingsCount,
    flaggedColumns: Array.from(flaggedColumns),
  };
}

/**
 * Masks sensitive PII strings
 */
export function maskSensitiveValue(value: string, type: 'ssn' | 'credit_card' | 'email' | 'phone'): string {
  if (!value) return value;
  switch (type) {
    case 'ssn':
      return value.replace(/\b(\d{3})-(\d{2})-(\d{4})\b/, '***-**-$3');
    case 'credit_card':
      return value.replace(/\b(?:\d{4}[ -]?){3}(\d{4})\b/, '****-****-****-$1');
    case 'email': {
      const parts = value.split('@');
      if (parts.length === 2) {
        const user = parts[0];
        const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
        return `${maskedUser}@${parts[1]}`;
      }
      return '***@***.***';
    }
    case 'phone':
      return value.replace(/\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/, '($1) ***-$3');
    default:
      return value;
  }
}

/**
 * Enforces authorization before an action is permitted.
 */
export function assertAuthorized(session: AuthSession | null, permission: Permission): void {
  if (!session) {
    throw new SecurityViolationError('UNAUTHENTICATED', 'Operation requires an authenticated session');
  }
  authService.requirePermission(session, permission);
}
