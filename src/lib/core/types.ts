export type RowId = string;

export interface DatasetRow extends Record<string, string> {
  _tr_id: RowId;
}

export interface DatasetVersion {
  versionId: string;
  versionNumber: number;
  fileName: string;
  headers: string[];
  rows: DatasetRow[];
  timestamp: string;
  label: string;
}

export type OperationType =
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
  | 'deduplicate'
  | 'schema_mapping'
  | 'sentiment'
  | 'ai_clean';

export interface CleaningOperation {
  operationId: string;
  type: OperationType;
  targetColumns: string[];
  targetRowIds?: RowId[];
  params?: Record<string, any>;
  reason: string;
  source: 'deterministic' | 'ai';
  confidence: 'high' | 'medium' | 'review';
  deterministic: boolean;
  reviewRequired: boolean;
  enabled?: boolean;
}

export interface OperationProposal {
  proposalId: string;
  summary: string;
  operations: CleaningOperation[];
  createdAt: string;
}

export interface ChangeRecord {
  id: string;
  runId: string;
  rowId: RowId;
  column: string;
  before: string;
  after: string;
  rule: string;
  source: 'deterministic' | 'ai';
  confidence?: 'high' | 'medium' | 'review';
  reason?: string;
  timestamp: string;
}

export interface StructuralChangeRecord {
  id: string;
  runId: string;
  type: 'row_removed_dedup' | 'row_merged' | 'column_mapped';
  affectedRowIds: RowId[];
  survivorRowId?: RowId;
  reason: string;
  rule: string;
  timestamp: string;
}

export interface InvariantViolation {
  code:
    | 'ID_MUTATED'
    | 'LEADING_ZERO_STRIPPED'
    | 'MONETARY_VALUE_ALTERED'
    | 'FABRICATED_ROW'
    | 'DUPLICATE_ROW_ID'
    | 'UNDECLARED_COLUMN'
    | 'UNKNOWN_COLUMN'
    | 'WRONG_VALUE_TYPE'
    | 'CONFLICTING_OPERATIONS'
    | 'MALFORMED_OUTPUT'
    | 'AMBIGUOUS_DATE'
    | 'FABRICATED_VALUE';
  message: string;
  rowId?: RowId;
  column?: string;
  beforeValue?: string;
  afterValue?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  violations: InvariantViolation[];
}

export interface CleaningRun {
  runId: string;
  versionBefore: number;
  versionAfter: number;
  operations: CleaningOperation[];
  changeRecords: ChangeRecord[];
  structuralChanges: StructuralChangeRecord[];
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  error?: string;
}
