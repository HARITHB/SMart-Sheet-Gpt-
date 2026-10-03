import type {
  DatasetRow,
  DatasetVersion,
  CleaningOperation,
  ChangeRecord,
  StructuralChangeRecord,
  CleaningRun,
  ValidationResult,
} from './types';
import { attachRowIds } from './rowId';
import { validateDatasetInvariants, validateOperations } from './invariants';

let runCounter = 1;

export function generateRunId(): string {
  return `run_${Date.now()}_${runCounter++}`;
}

export function createInitialVersion(
  fileName: string,
  headers: string[],
  rows: (Record<string, string> | DatasetRow)[],
  label = 'Original Dataset (v0)'
): DatasetVersion {
  const versionId = `v0_${Date.now()}`;
  const attachedRows = attachRowIds(rows as Record<string, string>[]);
  const cleanHeaders = headers.filter((h) => h !== '_tr_id');

  return {
    versionId,
    versionNumber: 0,
    fileName,
    headers: cleanHeaders,
    rows: attachedRows,
    timestamp: new Date().toISOString(),
    label,
  };
}

export interface TransactionExecutionOptions {
  label?: string;
  isCancelled?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}

export interface TransactionResult {
  success: boolean;
  newVersion?: DatasetVersion;
  changeRecords: ChangeRecord[];
  structuralChanges: StructuralChangeRecord[];
  run?: CleaningRun;
  validation: ValidationResult;
  error?: string;
}

/**
 * Executes cleaning operations transactionally against a base version.
 * - Operates strictly on an isolated candidate copy.
 * - If execution throws, is cancelled, or fails invariants, the candidate is discarded.
 * - Zero partial mutations occur to the base version.
 */
export async function executeTransactionalRun(
  baseVersion: DatasetVersion,
  operations: CleaningOperation[],
  applyFn: (
    candidateRows: DatasetRow[],
    candidateHeaders: string[],
    signal?: { isCancelled?: () => boolean; onProgress?: (completed: number, total: number) => void }
  ) => Promise<{ rows: DatasetRow[]; headers: string[] }> | { rows: DatasetRow[]; headers: string[] },
  options: TransactionExecutionOptions = {}
): Promise<TransactionResult> {
  const runId = generateRunId();
  const startedAt = new Date().toISOString();

  // 1. Create a deep clone candidate of base rows
  const candidateRows: DatasetRow[] = baseVersion.rows.map((r) => ({ ...r }));
  const candidateHeaders = [...baseVersion.headers];

  try {
    // Check early cancellation
    if (options.isCancelled && options.isCancelled()) {
      return {
        success: false,
        changeRecords: [],
        structuralChanges: [],
        validation: { valid: false, errors: ['Operation was cancelled by the user.'], warnings: [], violations: [] },
        error: 'Operation was cancelled.',
      };
    }

    // Pre-execution operation validation (Unknown columns & conflicting operations)
    const opValidation = validateOperations(operations, baseVersion.headers);
    if (!opValidation.valid) {
      return {
        success: false,
        changeRecords: [],
        structuralChanges: [],
        validation: opValidation,
        error: `Operation safety check failed: ${opValidation.errors.join('; ')}`,
      };
    }

    // 2. Execute operations against isolated candidate
    const result = await applyFn(candidateRows, candidateHeaders, {
      isCancelled: options.isCancelled,
      onProgress: options.onProgress,
    });

    if (options.isCancelled && options.isCancelled()) {
      return {
        success: false,
        changeRecords: [],
        structuralChanges: [],
        validation: { valid: false, errors: ['Operation was cancelled by the user.'], warnings: [], violations: [] },
        error: 'Operation was cancelled.',
      };
    }

    const transformedRows = result.rows;
    const transformedHeaders = result.headers.filter((h) => h !== '_tr_id');

    // 3. Post-execution Invariant Validation
    const validation = validateDatasetInvariants(baseVersion, transformedRows, transformedHeaders, operations);
    if (!validation.valid) {
      return {
        success: false,
        changeRecords: [],
        structuralChanges: [],
        validation,
        error: `Integrity invariant violation: ${validation.errors.join('; ')}`,
      };
    }

    // 4. Generate stable Change Records using stable row IDs (_tr_id)
    const changeRecords: ChangeRecord[] = [];
    const structuralChanges: StructuralChangeRecord[] = [];
    const now = new Date().toISOString();

    const baseRowMap = new Map<string, DatasetRow>();
    for (const r of baseVersion.rows) {
      baseRowMap.set(r._tr_id, r);
    }

    const candidateRowMap = new Map<string, DatasetRow>();
    for (const r of transformedRows) {
      candidateRowMap.set(r._tr_id, r);
    }

    // 4a. Identify cell modifications on surviving rows
    for (const candRow of transformedRows) {
      const baseRow = baseRowMap.get(candRow._tr_id);
      if (!baseRow) continue;

      for (const col of transformedHeaders) {
        const b = baseRow[col] ?? '';
        const a = candRow[col] ?? '';
        if (b !== a) {
          const matchingOp = operations.find((op) => op.targetColumns.includes(col)) || operations[0];
          changeRecords.push({
            id: `chg_${runId}_${candRow._tr_id}_${col}_${changeRecords.length}`,
            runId,
            rowId: candRow._tr_id,
            column: col,
            before: b,
            after: a,
            rule: matchingOp?.reason || matchingOp?.type || 'Data transformation',
            source: matchingOp?.source || 'deterministic',
            confidence: matchingOp?.confidence || 'high',
            reason: b === '' ? 'Filled empty value' : 'Standardized format/casing',
            timestamp: now,
          });
        }
      }
    }

    // 4b. Identify removed rows (e.g. deduplication)
    const removedRowIds: string[] = [];
    for (const baseRow of baseVersion.rows) {
      if (!candidateRowMap.has(baseRow._tr_id)) {
        removedRowIds.push(baseRow._tr_id);
      }
    }

    if (removedRowIds.length > 0) {
      structuralChanges.push({
        id: `str_${runId}_dedup`,
        runId,
        type: 'row_removed_dedup',
        affectedRowIds: removedRowIds,
        reason: `Removed ${removedRowIds.length} duplicate row(s)`,
        rule: 'Deduplicate rows',
        timestamp: now,
      });
    }

    // 5. Build the committed new version
    const newVersionNumber = baseVersion.versionNumber + 1;
    const newVersion: DatasetVersion = {
      versionId: `v${newVersionNumber}_${Date.now()}`,
      versionNumber: newVersionNumber,
      fileName: baseVersion.fileName,
      headers: transformedHeaders,
      rows: transformedRows,
      timestamp: now,
      label: options.label || `Cleaning Run ${newVersionNumber}`,
    };

    const run: CleaningRun = {
      runId,
      versionBefore: baseVersion.versionNumber,
      versionAfter: newVersionNumber,
      operations,
      changeRecords,
      structuralChanges,
      status: 'completed',
      startedAt,
      completedAt: now,
    };

    return {
      success: true,
      newVersion,
      changeRecords,
      structuralChanges,
      run,
      validation,
    };
  } catch (err: any) {
    // Complete rollback - candidate copy is discarded
    return {
      success: false,
      changeRecords: [],
      structuralChanges: [],
      validation: {
        valid: false,
        errors: [err?.message || 'Transaction failed unexpectedly'],
        warnings: [],
        violations: [],
      },
      error: err?.message || 'Execution error during transaction',
    };
  }
}

/**
 * Immutable Version Chain Manager for navigating dataset versions.
 */
export interface VersionComparisonResult {
  fromVersion: DatasetVersion | null;
  toVersion: DatasetVersion | null;
  rowCountBefore: number;
  rowCountAfter: number;
  diffCount: number;
  modifiedRows: {
    rowId: string;
    changes: { column: string; before: string; after: string }[];
  }[];
  removedRowIds: string[];
  addedRowIds: string[];
}

export class VersionManager {
  private versions: DatasetVersion[] = [];
  private currentIdx = -1;
  private runs: CleaningRun[] = [];

  constructor(initialVersion?: DatasetVersion) {
    if (initialVersion) {
      this.init(initialVersion);
    }
  }

  init(initialVersion: DatasetVersion) {
    this.versions = [initialVersion];
    this.currentIdx = 0;
    this.runs = [];
  }

  getCurrentVersion(): DatasetVersion | null {
    if (this.currentIdx < 0 || this.currentIdx >= this.versions.length) {
      return null;
    }
    return this.versions[this.currentIdx];
  }

  getOriginalVersion(): DatasetVersion | null {
    return this.versions.length > 0 ? this.versions[0] : null;
  }

  getAllVersions(): DatasetVersion[] {
    return [...this.versions];
  }

  commit(newVersion: DatasetVersion, run?: CleaningRun) {
    // If we branched or undid, drop forward history
    this.versions = this.versions.slice(0, this.currentIdx + 1);
    this.versions.push(newVersion);
    this.currentIdx = this.versions.length - 1;
    if (run) {
      this.runs.push(run);
    }
  }

  canUndo(): boolean {
    return this.currentIdx > 0;
  }

  undo(): DatasetVersion | null {
    if (!this.canUndo()) return null;
    this.currentIdx--;
    return this.versions[this.currentIdx];
  }

  resetToOriginal(): DatasetVersion | null {
    if (this.versions.length === 0) return null;
    this.currentIdx = 0;
    return this.versions[0];
  }

  getVersion(versionNumber: number): DatasetVersion | null {
    return this.versions.find((v) => v.versionNumber === versionNumber) || null;
  }

  /**
   * P1.7: Restores a previous version by creating a NEW version derived from it.
   * Does NOT erase or mutate history.
   */
  restoreVersion(targetVersionNumber: number, customLabel?: string): DatasetVersion | null {
    const target = this.getVersion(targetVersionNumber);
    if (!target) return null;

    const nextVerNumber = this.versions.length;
    const now = new Date().toISOString();
    const restoredVersion: DatasetVersion = {
      versionId: `v${nextVerNumber}_${Date.now()}`,
      versionNumber: nextVerNumber,
      fileName: target.fileName,
      headers: [...target.headers],
      rows: target.rows.map((r) => ({ ...r })),
      timestamp: now,
      label: customLabel || `Restored from Version v${target.versionNumber}`,
    };

    this.commit(restoredVersion);
    return restoredVersion;
  }

  /**
   * P1.7: Compares any two arbitrary versions in the version chain using stable row IDs.
   */
  compareVersions(
    fromVersionNumber: number,
    toVersionNumber: number
  ): VersionComparisonResult {
    const fromV = this.getVersion(fromVersionNumber);
    const toV = this.getVersion(toVersionNumber);

    if (!fromV || !toV) {
      return {
        fromVersion: fromV,
        toVersion: toV,
        rowCountBefore: fromV?.rows.length ?? 0,
        rowCountAfter: toV?.rows.length ?? 0,
        diffCount: 0,
        modifiedRows: [],
        removedRowIds: [],
        addedRowIds: [],
      };
    }

    const fromMap = new Map<string, DatasetRow>();
    for (const r of fromV.rows) {
      fromMap.set(r._tr_id, r);
    }

    const toMap = new Map<string, DatasetRow>();
    for (const r of toV.rows) {
      toMap.set(r._tr_id, r);
    }

    const modifiedRows: {
      rowId: string;
      changes: { column: string; before: string; after: string }[];
    }[] = [];
    let diffCount = 0;

    for (const [id, toRow] of toMap.entries()) {
      const fromRow = fromMap.get(id);
      if (!fromRow) continue;

      const changes: { column: string; before: string; after: string }[] = [];
      const commonCols = toV.headers.filter((h) => fromV.headers.includes(h) && h !== '_tr_id');

      for (const col of commonCols) {
        const b = fromRow[col] ?? '';
        const a = toRow[col] ?? '';
        if (b !== a) {
          changes.push({ column: col, before: b, after: a });
          diffCount++;
        }
      }

      if (changes.length > 0) {
        modifiedRows.push({ rowId: id, changes });
      }
    }

    const removedRowIds = fromV.rows.filter((r) => !toMap.has(r._tr_id)).map((r) => r._tr_id);
    const addedRowIds = toV.rows.filter((r) => !fromMap.has(r._tr_id)).map((r) => r._tr_id);

    return {
      fromVersion: fromV,
      toVersion: toV,
      rowCountBefore: fromV.rows.length,
      rowCountAfter: toV.rows.length,
      diffCount,
      modifiedRows,
      removedRowIds,
      addedRowIds,
    };
  }

  getAllChangeRecords(): ChangeRecord[] {
    const all: ChangeRecord[] = [];
    for (let i = 0; i <= this.currentIdx; i++) {
      if (this.runs[i - 1]?.changeRecords) {
        all.push(...this.runs[i - 1].changeRecords);
      }
    }
    return all;
  }
}
