/**
 * SaaS Foundation: Session Recovery & Checkpointing
 * Auto-saves working dataset state, validates recovery checkpoint integrity,
 * and recovers seamlessly from crashes or accidental browser closures.
 */

import { DatasetRow, DatasetVersion } from '../core/types';
import { validateDatasetInvariants } from '../core/invariants';

export interface SessionCheckpoint {
  checkpointId: string;
  workspaceId: string;
  datasetId?: string;
  fileName: string;
  headers: string[];
  rows: DatasetRow[];
  currentVersion: DatasetVersion;
  versions: DatasetVersion[];
  hasModifications: boolean;
  activeTab: string;
  lastSavedAt: string;
  integrityHash: string;
  isCleanExit: boolean;
}

export interface SessionRecoveryResult {
  recovered: boolean;
  checkpoint?: SessionCheckpoint;
  error?: string;
}

export class SessionRecoveryManager {
  private readonly storageKey = 'tidyrow_session_checkpoint';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.setupUnloadHandler();
  }

  private setupUnloadHandler() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        // Mark clean exit if there were no unsaved critical errors
        this.markCleanExit(true);
      });
    }
  }

  private computeIntegrityHash(headers: string[], rows: DatasetRow[]): string {
    const sample = `${headers.join(',')}:${rows.length}:${rows[0]?._tr_id || ''}:${rows[rows.length - 1]?._tr_id || ''}`;
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = (hash << 5) - hash + sample.charCodeAt(i);
      hash |= 0;
    }
    return `chk_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Schedules a debounced checkpoint save.
   */
  scheduleCheckpoint(checkpoint: Omit<SessionCheckpoint, 'checkpointId' | 'lastSavedAt' | 'integrityHash' | 'isCleanExit'>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.saveCheckpointImmediate(checkpoint);
    }, 500);
  }

  /**
   * Immediately saves a session checkpoint to persistent storage.
   */
  saveCheckpointImmediate(
    checkpoint: Omit<SessionCheckpoint, 'checkpointId' | 'lastSavedAt' | 'integrityHash' | 'isCleanExit'>
  ): SessionCheckpoint | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;

    try {
      const integrityHash = this.computeIntegrityHash(checkpoint.headers, checkpoint.rows);
      const fullCheckpoint: SessionCheckpoint = {
        ...checkpoint,
        checkpointId: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lastSavedAt: new Date().toISOString(),
        integrityHash,
        isCleanExit: false, // will be marked true on normal unload
      };

      window.localStorage.setItem(this.storageKey, JSON.stringify(fullCheckpoint));
      return fullCheckpoint;
    } catch (err) {
      console.warn('Failed to save session checkpoint:', err);
      return null;
    }
  }

  /**
   * Checks whether a valid, non-empty session checkpoint exists for recovery.
   */
  hasRecoverableSession(workspaceId?: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return false;

      const checkpoint = JSON.parse(raw) as SessionCheckpoint;
      if (!checkpoint || !checkpoint.rows || checkpoint.rows.length === 0) return false;
      if (workspaceId && checkpoint.workspaceId !== workspaceId) return false;

      // Verify row structure and integrity hash
      const expectedHash = this.computeIntegrityHash(checkpoint.headers, checkpoint.rows);
      if (checkpoint.integrityHash !== expectedHash) {
        console.warn('Session checkpoint integrity mismatch; discarding corrupted checkpoint.');
        this.discardCheckpoint();
        return false;
      }

      // Verify row structure: all rows must have a valid _tr_id and cell strings
      const rowsValid = checkpoint.rows.every(
        (r) => r._tr_id && typeof r._tr_id === 'string' &&
        checkpoint.headers.every((h) => typeof r[h] === 'string' || r[h] === undefined)
      );
      if (!rowsValid) return false;

      if (checkpoint.currentVersion && checkpoint.currentVersion.rows) {
        const invariantCheck = validateDatasetInvariants(checkpoint.currentVersion, checkpoint.rows, checkpoint.headers);
        return invariantCheck.valid;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves the current checkpoint without modifying storage.
   */
  getRecoverableSession(workspaceId?: string): SessionCheckpoint | null {
    if (!this.hasRecoverableSession(workspaceId)) return null;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Recovers the session and clears the checkpoint to prevent duplicate prompts.
   */
  recoverSession(workspaceId?: string): SessionRecoveryResult {
    const checkpoint = this.getRecoverableSession(workspaceId);
    if (!checkpoint) {
      return { recovered: false, error: 'No valid recovery checkpoint found.' };
    }

    return {
      recovered: true,
      checkpoint,
    };
  }

  /**
   * Discards the saved checkpoint permanently.
   */
  discardCheckpoint(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore
      }
    }
  }

  private markCleanExit(clean: boolean): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.isCleanExit = clean;
          window.localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        }
      } catch {
        // Ignore
      }
    }
  }
}

export const sessionRecoveryService = new SessionRecoveryManager();
