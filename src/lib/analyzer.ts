export interface DetectedIssue {
  id: string;
  type: 'duplicates' | 'inconsistent_casing' | 'missing_values' | 'broken_formats' | 'whitespace';
  title: string;
  description: string;
  count: number;
  column?: string;
  suggestedAction: string;
  severity: 'high' | 'medium' | 'low';
}

export interface AttentionFlag {
  id: string;
  column: string;
  issue: string;
  affectedCount: number;
  sampleValue?: string;
  recommendation: string;
}

export interface FuzzyDuplicateCandidate {
  id: string;
  rowAIndex: number;
  rowBIndex: number;
  field: string;
  valueA: string;
  valueB: string;
  similarityReason: string;
  confidence: 'high' | 'medium';
}

export interface DatasetAnalysis {
  totalRows: number;
  totalColumns: number;
  duplicateRows: number;
  normalizedDuplicateRows: number;
  emptyCells: number;
  explicitPlaceholderCells: number; // cells containing 'null', 'na', 'n/a', '-'
  inconsistentCaseCount: number;
  brokenFormatsCount: number;
  whitespaceIssuesCount: number;
  qualityScore: number;
  statusLabel: string;
  statusTone: 'clean' | 'review' | 'attention';
  issues: DetectedIssue[];
  flags: AttentionFlag[];
  fuzzyDuplicates: FuzzyDuplicateCandidate[];
}

export function inferColumnType(
  values: string[],
  headerName = ''
): {
  type: 'text' | 'number' | 'id' | 'date' | 'boolean' | 'email' | 'phone';
  empties: number;
  nulls: number;
} {
  let empties = 0;
  let nulls = 0;
  let isNumeric = true;
  let isBoolean = true;
  let isDate = true;
  let isEmail = true;
  let isPhone = true;
  let hasLeadingZero = false;

  const isIdHeader = /(id|code|sku|uuid|token|ref|ssn|serial|number)/i.test(headerName);

  for (const val of values) {
    const trimmed = (val ?? '').trim();
    if (trimmed === '') {
      empties++;
      continue;
    }
    if (
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'na' ||
      trimmed.toLowerCase() === 'n/a' ||
      trimmed === '-'
    ) {
      nulls++;
      continue;
    }

    // Check for leading-zero identifiers (e.g. "001234") - must preserve as ID/text!
    if (/^0\d+$/.test(trimmed) && trimmed.length > 1) {
      hasLeadingZero = true;
    }

    if (isNumeric && isNaN(Number(trimmed.replace(/[$,]/g, '')))) {
      isNumeric = false;
    }

    if (
      isBoolean &&
      !['true', 'false', 'yes', 'no', '0', '1'].includes(trimmed.toLowerCase())
    ) {
      isBoolean = false;
    }

    if (isDate && (isNaN(Date.parse(trimmed)) || trimmed.length < 6 || !/\d/.test(trimmed))) {
      isDate = false;
    }

    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      isEmail = false;
    }

    if (isPhone && !/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}$/.test(trimmed)) {
      isPhone = false;
    }
  }

  // ID guardrail: Never convert leading-zero strings into pure numbers
  if (isIdHeader || hasLeadingZero) {
    return { type: 'id', empties, nulls };
  }

  let type: 'text' | 'number' | 'id' | 'date' | 'boolean' | 'email' | 'phone' = 'text';
  if (isEmail) type = 'email';
  else if (isPhone) type = 'phone';
  else if (isNumeric) type = 'number';
  else if (isBoolean) type = 'boolean';
  else if (isDate) type = 'date';

  return { type, empties, nulls };
}

export function analyzeDataset(
  headers: string[],
  rows: Record<string, string>[]
): DatasetAnalysis {
  const totalRows = rows.length;
  const totalColumns = headers.length;
  if (totalRows === 0 || totalColumns === 0) {
    return {
      totalRows: 0,
      totalColumns: 0,
      duplicateRows: 0,
      normalizedDuplicateRows: 0,
      emptyCells: 0,
      explicitPlaceholderCells: 0,
      inconsistentCaseCount: 0,
      brokenFormatsCount: 0,
      whitespaceIssuesCount: 0,
      qualityScore: 100,
      statusLabel: 'No data',
      statusTone: 'clean',
      issues: [],
      flags: [],
      fuzzyDuplicates: [],
    };
  }

  // 1. Detect exact duplicates
  const rowExactSignatures = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const sig = headers.map((h) => row[h] ?? '').join('||');
    if (rowExactSignatures.has(sig)) {
      duplicateRows++;
    } else {
      rowExactSignatures.add(sig);
    }
  }

  // 1b. Detect normalized duplicates (identical after trim and lowercase)
  const rowNormalizedSignatures = new Set<string>();
  let normalizedDuplicateRows = 0;
  for (const row of rows) {
    const normSig = headers.map((h) => (row[h] ?? '').trim().toLowerCase()).join('||');
    if (rowNormalizedSignatures.has(normSig)) {
      normalizedDuplicateRows++;
    } else {
      rowNormalizedSignatures.add(normSig);
    }
  }

  // 2. Detect empty cells vs explicit placeholder cells ('null', 'na', 'n/a', '-')
  let emptyCells = 0;
  let explicitPlaceholderCells = 0;
  let whitespaceIssuesCount = 0;
  for (const row of rows) {
    for (const h of headers) {
      const raw = row[h] ?? '';
      const trimmed = raw.trim().toLowerCase();
      if (raw !== raw.trim() || /\s{2,}/.test(raw)) {
        whitespaceIssuesCount++;
      }
      if (trimmed === '') {
        emptyCells++;
      } else if (trimmed === 'null' || trimmed === 'na' || trimmed === 'n/a' || trimmed === '-') {
        explicitPlaceholderCells++;
      }
    }
  }

  // 3. Detect inconsistent casing in text columns (e.g. "JOHN", "john", "John")
  let inconsistentCaseCount = 0;
  const casingIssuesByCol: Record<string, number> = {};

  for (const h of headers) {
    const isTextHeader = !/(id|date|phone|total|price|rating|votes|zip|code)/i.test(h);
    if (!isTextHeader) continue;

    let hasUpper = false;
    let hasLower = false;
    let hasTitle = false;
    let colInconsistentRows = 0;

    for (const row of rows) {
      const val = (row[h] ?? '').trim();
      if (val.length < 2 || !/[a-zA-Z]/.test(val)) continue;

      const isAllUpper = val === val.toUpperCase() && val !== val.toLowerCase();
      const isAllLower = val === val.toLowerCase() && val !== val.toUpperCase();
      const isTitle = /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(val);

      if (isAllUpper) hasUpper = true;
      if (isAllLower) hasLower = true;
      if (isTitle) hasTitle = true;

      if (isAllUpper || isAllLower) {
        colInconsistentRows++;
      }
    }

    if ((hasUpper && hasLower) || (hasUpper && hasTitle) || (hasLower && hasTitle)) {
      casingIssuesByCol[h] = colInconsistentRows;
      inconsistentCaseCount += colInconsistentRows;
    }
  }

  // 4. Detect broken formats & generate flags ("Flag it. Don't guess.")
  let brokenFormatsCount = 0;
  const flags: AttentionFlag[] = [];

  for (const h of headers) {
    const isPhoneCol = /(phone|tel|mobile)/i.test(h);
    const isAddressCol = /(address|street|addr)/i.test(h);
    const isEmailCol = /(email|mail)/i.test(h);
    const isDateCol = /(date|time)/i.test(h);

    let colBrokenCount = 0;
    let sampleVal = '';

    if (isPhoneCol) {
      for (const row of rows) {
        const val = (row[h] ?? '').trim();
        if (val && !/^\+\d{10,14}$|^\(\d{3}\)\s\d{3}-\d{4}$/.test(val)) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
        }
      }
      if (colBrokenCount > 0) {
        brokenFormatsCount += colBrokenCount;
        flags.push({
          id: `flag_phone_${h}`,
          column: h,
          issue: 'Mixed phone formatting delimiters',
          affectedCount: colBrokenCount,
          sampleValue: sampleVal,
          recommendation: 'Review phone normalization proposal before applying',
        });
      }
    } else if (isAddressCol) {
      for (const row of rows) {
        const val = (row[h] ?? '').trim();
        if (val && (!/\b\d{5}\b/.test(val) || !val.includes(','))) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
        }
      }
      if (colBrokenCount > 0) {
        brokenFormatsCount += colBrokenCount;
        flags.push({
          id: `flag_addr_${h}`,
          column: h,
          issue: 'Unparsed street address with missing ZIP code',
          affectedCount: colBrokenCount,
          sampleValue: sampleVal,
          recommendation: 'Extract 5-digit US ZIP code into dedicated column',
        });
      }
    } else if (isEmailCol) {
      for (const row of rows) {
        const val = (row[h] ?? '').trim();
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
        }
      }
      if (colBrokenCount > 0) {
        flags.push({
          id: `flag_email_${h}`,
          column: h,
          issue: 'Invalid or malformed email syntax',
          affectedCount: colBrokenCount,
          sampleValue: sampleVal,
          recommendation: 'Verify email addresses before campaign dispatch',
        });
      }
    } else if (isDateCol) {
      let hasSlash = false;
      let hasDash = false;
      for (const row of rows) {
        const val = (row[h] ?? '').trim();
        if (val.includes('/')) hasSlash = true;
        if (val.includes('-')) hasDash = true;
      }
      if (hasSlash && hasDash) {
        flags.push({
          id: `flag_date_${h}`,
          column: h,
          issue: 'Mixed date formats (slashes and hyphens)',
          affectedCount: rows.length,
          recommendation: 'Standardize date representation to YYYY-MM-DD',
        });
      }
    }
  }

  // 5. Detect potential fuzzy duplicates (Suggestions only — never silently delete!)
  const fuzzyDuplicates: FuzzyDuplicateCandidate[] = [];
  const emailCol = headers.find((h) => /(email|mail)/i.test(h));
  const nameCol = headers.find((h) => /(name|lead|customer)/i.test(h));

  if (emailCol) {
    const seenEmails: Record<string, number> = {};
    for (let i = 0; i < Math.min(rows.length, 500); i++) {
      const emailVal = (rows[i][emailCol] ?? '').trim().toLowerCase();
      if (!emailVal || emailVal === 'n/a' || emailVal === 'null') continue;

      if (seenEmails[emailVal] !== undefined) {
        const prevIdx = seenEmails[emailVal];
        fuzzyDuplicates.push({
          id: `fuzzy_${prevIdx}_${i}`,
          rowAIndex: prevIdx,
          rowBIndex: i,
          field: emailCol,
          valueA: rows[prevIdx][emailCol] ?? '',
          valueB: rows[i][emailCol] ?? '',
          similarityReason: `Identical email address "${emailVal}" with different row attributes`,
          confidence: 'high',
        });
      } else {
        seenEmails[emailVal] = i;
      }
    }
  }

  // Calculate overall score & honest status language
  const totalCells = totalRows * totalColumns;
  const issueSum =
    normalizedDuplicateRows * totalColumns +
    inconsistentCaseCount +
    whitespaceIssuesCount +
    brokenFormatsCount;

  const qualityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (issueSum / Math.max(1, totalCells)) * 100))
  );

  const totalIssueCount =
    normalizedDuplicateRows +
    inconsistentCaseCount +
    whitespaceIssuesCount +
    brokenFormatsCount +
    explicitPlaceholderCells;

  const statusLabel =
    totalIssueCount === 0
      ? 'Data checks passed'
      : flags.length > 0
      ? `${totalIssueCount} issues detected (needs review)`
      : `${totalIssueCount} issues detected`;

  const statusTone: 'clean' | 'review' | 'attention' =
    totalIssueCount === 0 ? 'clean' : flags.length > 0 ? 'attention' : 'review';

  // Generate structured issue blocks
  const issues: DetectedIssue[] = [];

  if (normalizedDuplicateRows > 0) {
    issues.push({
      id: 'duplicates',
      type: 'duplicates',
      title: `${normalizedDuplicateRows} duplicate ${normalizedDuplicateRows === 1 ? 'record' : 'records'} detected`,
      description: 'Identical records across columns that inflate counts and skew metrics.',
      count: normalizedDuplicateRows,
      suggestedAction: 'Deduplicate Rows',
      severity: 'high',
    });
  }

  if (inconsistentCaseCount > 0) {
    const topCol = Object.entries(casingIssuesByCol).sort((a, b) => b[1] - a[1])[0];
    issues.push({
      id: 'inconsistent_casing',
      type: 'inconsistent_casing',
      title: `${inconsistentCaseCount} text casing ${inconsistentCaseCount === 1 ? 'anomaly' : 'anomalies'}`,
      description: `Mixed uppercase, lowercase, and sentence casing detected (e.g. in ${topCol ? topCol[0] : 'names'}).`,
      count: inconsistentCaseCount,
      column: topCol ? topCol[0] : undefined,
      suggestedAction: 'Standardize to Title Case',
      severity: 'medium',
    });
  }

  if (whitespaceIssuesCount > 0) {
    issues.push({
      id: 'whitespace',
      type: 'whitespace',
      title: `${whitespaceIssuesCount} cells with irregular whitespace`,
      description: 'Trailing tabs, leading spaces, or double spaces causing formula and lookup failures.',
      count: whitespaceIssuesCount,
      suggestedAction: 'Trim Whitespace',
      severity: 'low',
    });
  }

  if (explicitPlaceholderCells > 0) {
    issues.push({
      id: 'missing_values',
      type: 'missing_values',
      title: `${explicitPlaceholderCells} unstandardized missing markers`,
      description: 'Mixed placeholder notations like "null", "na", and "-" that can be standardized.',
      count: explicitPlaceholderCells,
      suggestedAction: 'Standardize Placeholders to "—"',
      severity: 'low',
    });
  }

  if (brokenFormatsCount > 0) {
    issues.push({
      id: 'broken_formats',
      type: 'broken_formats',
      title: `${brokenFormatsCount} unstandardized ${brokenFormatsCount === 1 ? 'format' : 'formats'}`,
      description: 'Phone numbers or street addresses written with mixed punctuation and missing elements.',
      count: brokenFormatsCount,
      suggestedAction: 'Review Format Normalization',
      severity: 'medium',
    });
  }

  return {
    totalRows,
    totalColumns,
    duplicateRows,
    normalizedDuplicateRows,
    emptyCells,
    explicitPlaceholderCells,
    inconsistentCaseCount,
    brokenFormatsCount,
    whitespaceIssuesCount,
    qualityScore,
    statusLabel,
    statusTone,
    issues,
    flags,
    fuzzyDuplicates,
  };
}

export function deduplicateRows(
  headers: string[],
  rows: Record<string, string>[]
): Record<string, string>[] {
  const seen = new Set<string>();
  const uniqueRows: Record<string, string>[] = [];

  for (const row of rows) {
    const sig = headers.map((h) => (row[h] ?? '').trim().toLowerCase()).join('||');
    if (!seen.has(sig)) {
      seen.add(sig);
      uniqueRows.push(row);
    }
  }

  return uniqueRows;
}

export interface QualityComparison {
  beforeQuality: number;
  afterQuality: number;
  qualityDelta: number;
  duplicatesResolved: number;
  emptyCellsRemaining: number;
  casingResolved: number;
  unresolvedAttentionCount: number;
  afterStatusLabel: string;
}

export function compareDatasetAnalyses(
  before: DatasetAnalysis,
  after: DatasetAnalysis
): QualityComparison {
  return {
    beforeQuality: before.qualityScore,
    afterQuality: after.qualityScore,
    qualityDelta: Math.max(0, after.qualityScore - before.qualityScore),
    duplicatesResolved: Math.max(0, before.normalizedDuplicateRows - after.normalizedDuplicateRows),
    emptyCellsRemaining: after.emptyCells + after.explicitPlaceholderCells,
    casingResolved: Math.max(0, before.inconsistentCaseCount - after.inconsistentCaseCount),
    unresolvedAttentionCount: after.flags.length,
    afterStatusLabel: after.statusLabel,
  };
}
