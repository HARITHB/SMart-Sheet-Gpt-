export interface DetectedIssue {
  id: string;
  type: 'duplicates' | 'inconsistent_casing' | 'missing_values' | 'broken_formats' | 'whitespace';
  title: string;
  description: string;
  count: number;
  column?: string;
  affectedRowIndices?: number[];
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

export interface ColumnProfile {
  columnName: string;
  inferredType: 'text' | 'number' | 'id' | 'date' | 'boolean' | 'email' | 'phone';
  typeConfidence: number; // 0-100
  completenessScore: number; // 0-100
  validityScore: number; // 0-100
  uniquenessScore: number; // 0-100
  columnScore: number; // 0-100
  emptyCount: number;
  invalidCount: number;
  duplicateCount: number;
  totalCount: number;
  sampleValues: string[];
  issues: string[];
}

export interface QualityDimensions {
  completeness: number; // 0-100
  validity: number;     // 0-100
  consistency: number;  // 0-100
  uniqueness: number;   // 0-100
  overall: number;      // 0-100
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
  dimensions: QualityDimensions;
  columnProfiles: ColumnProfile[];
  issues: DetectedIssue[];
  flags: AttentionFlag[];
  fuzzyDuplicates: FuzzyDuplicateCandidate[];
}

export function inferColumnType(
  values: string[],
  headerName = ''
): {
  type: 'text' | 'number' | 'id' | 'date' | 'boolean' | 'email' | 'phone';
  confidence: number;
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
    return { type: 'id', confidence: 98, empties, nulls };
  }

  let type: 'text' | 'number' | 'id' | 'date' | 'boolean' | 'email' | 'phone' = 'text';
  let confidence = 90;

  if (isEmail) {
    type = 'email';
    confidence = 98;
  } else if (isPhone) {
    type = 'phone';
    confidence = 94;
  } else if (isNumeric) {
    type = 'number';
    confidence = 95;
  } else if (isBoolean) {
    type = 'boolean';
    confidence = 99;
  } else if (isDate) {
    type = 'date';
    confidence = 91;
  }

  return { type, confidence, empties, nulls };
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
      dimensions: {
        completeness: 100,
        validity: 100,
        consistency: 100,
        uniqueness: 100,
        overall: 100,
      },
      columnProfiles: [],
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
  const duplicateRowIndices: number[] = [];

  rows.forEach((row, idx) => {
    const normSig = headers.map((h) => (row[h] ?? '').trim().toLowerCase()).join('||');
    if (rowNormalizedSignatures.has(normSig)) {
      normalizedDuplicateRows++;
      duplicateRowIndices.push(idx);
    } else {
      rowNormalizedSignatures.add(normSig);
    }
  });

  // 2. Detect empty cells vs explicit placeholder cells ('null', 'na', 'n/a', '-')
  let emptyCells = 0;
  let explicitPlaceholderCells = 0;
  let whitespaceIssuesCount = 0;
  const emptyCellRowIndices: number[] = [];
  const whitespaceRowIndices: number[] = [];

  rows.forEach((row, idx) => {
    let rowHasEmpty = false;
    let rowHasWhitespace = false;

    for (const h of headers) {
      const raw = row[h] ?? '';
      const trimmed = raw.trim().toLowerCase();
      if (raw !== raw.trim() || /\s{2,}/.test(raw)) {
        whitespaceIssuesCount++;
        rowHasWhitespace = true;
      }
      if (trimmed === '') {
        emptyCells++;
        rowHasEmpty = true;
      } else if (trimmed === 'null' || trimmed === 'na' || trimmed === 'n/a' || trimmed === '-') {
        explicitPlaceholderCells++;
        rowHasEmpty = true;
      }
    }

    if (rowHasEmpty) emptyCellRowIndices.push(idx);
    if (rowHasWhitespace) whitespaceRowIndices.push(idx);
  });

  // 3. Detect inconsistent casing in text columns
  let inconsistentCaseCount = 0;
  const casingIssuesByCol: Record<string, number> = {};
  const casingRowIndices: number[] = [];

  for (const h of headers) {
    const isTextHeader = !/(id|date|phone|total|price|rating|votes|zip|code)/i.test(h);
    if (!isTextHeader) continue;

    let hasUpper = false;
    let hasLower = false;
    let hasTitle = false;
    let colInconsistentRows = 0;

    rows.forEach((row, idx) => {
      const val = (row[h] ?? '').trim();
      if (val.length < 2 || !/[a-zA-Z]/.test(val)) return;

      const isAllUpper = val === val.toUpperCase() && val !== val.toLowerCase();
      const isAllLower = val === val.toLowerCase() && val !== val.toUpperCase();
      const isTitle = /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(val);

      if (isAllUpper) hasUpper = true;
      if (isAllLower) hasLower = true;
      if (isTitle) hasTitle = true;

      if (isAllUpper || isAllLower) {
        colInconsistentRows++;
        if (!casingRowIndices.includes(idx)) casingRowIndices.push(idx);
      }
    });

    if ((hasUpper && hasLower) || (hasUpper && hasTitle) || (hasLower && hasTitle)) {
      casingIssuesByCol[h] = colInconsistentRows;
      inconsistentCaseCount += colInconsistentRows;
    }
  }

  // 4. Detect broken formats & generate flags
  let brokenFormatsCount = 0;
  const flags: AttentionFlag[] = [];
  const brokenFormatRowIndices: number[] = [];

  for (const h of headers) {
    const isPhoneCol = /(phone|tel|mobile)/i.test(h);
    const isAddressCol = /(address|street|addr)/i.test(h);
    const isEmailCol = /(email|mail)/i.test(h);
    const isDateCol = /(date|time)/i.test(h);

    let colBrokenCount = 0;
    let sampleVal = '';

    if (isPhoneCol) {
      rows.forEach((row, idx) => {
        const val = (row[h] ?? '').trim();
        if (val && !/^\+\d{10,14}$|^\(\d{3}\)\s\d{3}-\d{4}$/.test(val)) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
          if (!brokenFormatRowIndices.includes(idx)) brokenFormatRowIndices.push(idx);
        }
      });
      if (colBrokenCount > 0) {
        brokenFormatsCount += colBrokenCount;
        flags.push({
          id: `flag_phone_${h}`,
          column: h,
          issue: 'Mixed phone formatting delimiters',
          affectedCount: colBrokenCount,
          sampleValue: sampleVal,
          recommendation: 'Normalize to consistent phone number format',
        });
      }
    } else if (isAddressCol) {
      rows.forEach((row, idx) => {
        const val = (row[h] ?? '').trim();
        if (val && (!/\b\d{5}\b/.test(val) || !val.includes(','))) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
          if (!brokenFormatRowIndices.includes(idx)) brokenFormatRowIndices.push(idx);
        }
      });
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
      rows.forEach((row, idx) => {
        const val = (row[h] ?? '').trim();
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          colBrokenCount++;
          if (!sampleVal) sampleVal = val;
          if (!brokenFormatRowIndices.includes(idx)) brokenFormatRowIndices.push(idx);
        }
      });
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

  // 5. Detect potential fuzzy duplicates (Suggestions only)
  const fuzzyDuplicates: FuzzyDuplicateCandidate[] = [];
  const emailCol = headers.find((h) => /(email|mail)/i.test(h));

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

  // 6. Compute Comprehensive Column Profiles (Quality Engine 2.0)
  const columnProfiles: ColumnProfile[] = headers.map((col) => {
    const colValues: string[] = [];
    const sampleValues: string[] = [];
    let emptyCount = 0;
    let invalidCount = 0;
    const seenSet = new Set<string>();
    let duplicateCount = 0;

    for (let r = 0; r < Math.min(rows.length, 2000); r++) {
      const val = (rows[r][col] ?? '').trim();
      colValues.push(val);
      if (sampleValues.length < 5 && val && !sampleValues.includes(val)) {
        sampleValues.push(val);
      }

      if (!val || ['null', 'na', 'n/a', '-'].includes(val.toLowerCase())) {
        emptyCount++;
      } else {
        const lower = val.toLowerCase();
        if (seenSet.has(lower)) {
          duplicateCount++;
        } else {
          seenSet.add(lower);
        }
      }
    }

    const { type, confidence } = inferColumnType(colValues, col);

    // Check validity based on inferred type
    if (type === 'email') {
      colValues.forEach((v) => {
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) invalidCount++;
      });
    } else if (type === 'phone') {
      colValues.forEach((v) => {
        if (v && !/^\+\d{10,14}$|^\(\d{3}\)\s\d{3}-\d{4}$/.test(v)) invalidCount++;
      });
    }

    const totalVals = Math.max(1, colValues.length);
    const completenessScore = Math.round(((totalVals - emptyCount) / totalVals) * 100);
    const validityScore = Math.round(((totalVals - invalidCount) / totalVals) * 100);
    const uniquenessScore = Math.round(((seenSet.size) / Math.max(1, totalVals - emptyCount)) * 100);

    const issues: string[] = [];
    if (emptyCount > 0) issues.push(`${emptyCount} missing values`);
    if (invalidCount > 0) issues.push(`${invalidCount} format anomalies`);
    if (duplicateCount > 0) issues.push(`${duplicateCount} repeated values`);

    const columnScore = Math.round(
      completenessScore * 0.4 + validityScore * 0.4 + (issues.length === 0 ? 20 : 10)
    );

    return {
      columnName: col,
      inferredType: type,
      typeConfidence: confidence,
      completenessScore,
      validityScore,
      uniquenessScore,
      columnScore,
      emptyCount,
      invalidCount,
      duplicateCount,
      totalCount: totalVals,
      sampleValues,
      issues,
    };
  });

  // 7. Calculate 4 Health Dimensions
  const totalCells = totalRows * totalColumns;
  const filledCells = totalCells - (emptyCells + explicitPlaceholderCells);
  const completeness = Math.round((filledCells / Math.max(1, totalCells)) * 100);

  const invalidFormatCells = brokenFormatsCount;
  const validity = Math.max(0, Math.round(100 - (invalidFormatCells / Math.max(1, totalCells)) * 100));

  const consistencyErrors = inconsistentCaseCount + whitespaceIssuesCount;
  const consistency = Math.max(0, Math.round(100 - (consistencyErrors / Math.max(1, totalCells)) * 100));

  const uniqueness = Math.max(0, Math.round(100 - (normalizedDuplicateRows / Math.max(1, totalRows)) * 100));

  const overallQuality = Math.round(
    completeness * 0.3 + validity * 0.3 + consistency * 0.2 + uniqueness * 0.2
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

  // 8. Generate structured issue blocks with affected row indices
  const issues: DetectedIssue[] = [];

  if (normalizedDuplicateRows > 0) {
    issues.push({
      id: 'duplicates',
      type: 'duplicates',
      title: `${normalizedDuplicateRows} duplicate ${normalizedDuplicateRows === 1 ? 'record' : 'records'} detected`,
      description: 'Identical records across columns that inflate counts and skew metrics.',
      count: normalizedDuplicateRows,
      affectedRowIndices: duplicateRowIndices,
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
      affectedRowIndices: casingRowIndices,
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
      affectedRowIndices: whitespaceRowIndices,
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
      affectedRowIndices: emptyCellRowIndices,
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
      affectedRowIndices: brokenFormatRowIndices,
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
    qualityScore: overallQuality,
    statusLabel,
    statusTone,
    dimensions: {
      completeness,
      validity,
      consistency,
      uniqueness,
      overall: overallQuality,
    },
    columnProfiles,
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
