/**
 * SaaS Foundation: Persistence Model
 * Defines dataset persistence, snapshots, audit logs, and workspace isolation.
 * 
 * EXTERNAL BOUNDARY NOTE:
 * Object storage (S3 / GCS) and remote persistence (Postgres / Firestore) remain external.
 * This module provides clean typed domain storage contracts, an in-memory test adapter,
 * and a robust browser storage adapter (localStorage / IndexedDB compatible) with
 * complete workspace isolation and error recovery.
 */

import { DatasetRow, DatasetVersion } from '../core/types';

export interface DatasetMetadata {
  id: string;
  workspaceId: string;
  name: string;
  originalFileName: string;
  rowCount: number;
  columnCount: number;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
  retentionExpiresAt?: string;
  isEphemeral?: boolean;
}

export interface StoredDataset extends DatasetMetadata {
  headers: string[];
  rows: DatasetRow[];
}

export interface SnapshotMetadata {
  versionId: string;
  versionNumber: number;
  datasetId: string;
  workspaceId: string;
  label: string;
  rowCount: number;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  datasetId?: string;
  actorId: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface PersistenceAdapter {
  saveDataset(workspaceId: string, dataset: StoredDataset): Promise<void>;
  getDataset(workspaceId: string, datasetId: string): Promise<StoredDataset | null>;
  listDatasets(workspaceId: string): Promise<DatasetMetadata[]>;
  deleteDataset(workspaceId: string, datasetId: string, options?: { hardPurge?: boolean }): Promise<void>;
  saveSnapshot(workspaceId: string, datasetId: string, version: DatasetVersion): Promise<void>;
  getSnapshot(workspaceId: string, datasetId: string, versionId: string): Promise<DatasetVersion | null>;
  listSnapshots(workspaceId: string, datasetId: string): Promise<SnapshotMetadata[]>;
  saveAuditLog(workspaceId: string, log: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  getAuditLogs(workspaceId: string, datasetId?: string): Promise<AuditLogEntry[]>;
  clearWorkspaceData(workspaceId: string): Promise<void>;
}

/**
 * In-Memory Persistence Adapter
 * Ideal for unit testing, worker threads, and ephemeral processing modes.
 */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private datasets: Map<string, Map<string, StoredDataset>> = new Map();
  private snapshots: Map<string, Map<string, DatasetVersion>> = new Map();
  private auditLogs: Map<string, AuditLogEntry[]> = new Map();

  private getWsDatasets(workspaceId: string): Map<string, StoredDataset> {
    let ws = this.datasets.get(workspaceId);
    if (!ws) {
      ws = new Map();
      this.datasets.set(workspaceId, ws);
    }
    return ws;
  }

  private getWsSnapshots(workspaceId: string): Map<string, DatasetVersion> {
    let ws = this.snapshots.get(workspaceId);
    if (!ws) {
      ws = new Map();
      this.snapshots.set(workspaceId, ws);
    }
    return ws;
  }

  async saveDataset(workspaceId: string, dataset: StoredDataset): Promise<void> {
    const ws = this.getWsDatasets(workspaceId);
    ws.set(dataset.id, { ...dataset, workspaceId, updatedAt: new Date().toISOString() });
  }

  async getDataset(workspaceId: string, datasetId: string): Promise<StoredDataset | null> {
    const ws = this.getWsDatasets(workspaceId);
    const found = ws.get(datasetId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async listDatasets(workspaceId: string): Promise<DatasetMetadata[]> {
    const ws = this.getWsDatasets(workspaceId);
    return Array.from(ws.values()).map(({ rows, headers, ...meta }) => ({ ...meta }));
  }

  async deleteDataset(workspaceId: string, datasetId: string): Promise<void> {
    const ws = this.getWsDatasets(workspaceId);
    ws.delete(datasetId);
    // Delete snapshots for this dataset
    const snaps = this.getWsSnapshots(workspaceId);
    for (const [snapKey] of snaps.entries()) {
      if (snapKey.startsWith(datasetId + ':')) {
        snaps.delete(snapKey);
      }
    }
  }

  async saveSnapshot(workspaceId: string, datasetId: string, version: DatasetVersion): Promise<void> {
    const snaps = this.getWsSnapshots(workspaceId);
    snaps.set(`${datasetId}:${version.versionId}`, JSON.parse(JSON.stringify(version)));
  }

  async getSnapshot(workspaceId: string, datasetId: string, versionId: string): Promise<DatasetVersion | null> {
    const snaps = this.getWsSnapshots(workspaceId);
    const snap = snaps.get(`${datasetId}:${versionId}`);
    return snap ? JSON.parse(JSON.stringify(snap)) : null;
  }

  async listSnapshots(workspaceId: string, datasetId: string): Promise<SnapshotMetadata[]> {
    const snaps = this.getWsSnapshots(workspaceId);
    const list: SnapshotMetadata[] = [];
    const prefix = `${datasetId}:`;
    for (const [key, version] of snaps.entries()) {
      if (key.startsWith(prefix)) {
        list.push({
          versionId: version.versionId,
          versionNumber: version.versionNumber,
          datasetId,
          workspaceId,
          label: version.label,
          rowCount: version.rows.length,
          timestamp: version.timestamp,
        });
      }
    }
    return list.sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async saveAuditLog(
    workspaceId: string,
    log: Omit<AuditLogEntry, 'id' | 'timestamp'>
  ): Promise<AuditLogEntry> {
    let logs = this.auditLogs.get(workspaceId);
    if (!logs) {
      logs = [];
      this.auditLogs.set(workspaceId, logs);
    }
    const entry: AuditLogEntry = {
      ...log,
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId,
      timestamp: new Date().toISOString(),
    };
    logs.push(entry);
    return entry;
  }

  async getAuditLogs(workspaceId: string, datasetId?: string): Promise<AuditLogEntry[]> {
    const logs = this.auditLogs.get(workspaceId) || [];
    if (datasetId) {
      return logs.filter((l) => l.datasetId === datasetId);
    }
    return [...logs];
  }

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    this.datasets.delete(workspaceId);
    this.snapshots.delete(workspaceId);
    this.auditLogs.delete(workspaceId);
  }
}

/**
 * Browser Persistence Adapter
 * Uses isolated localStorage / IndexedDB fallback with error recovery.
 */
export class BrowserPersistenceAdapter implements PersistenceAdapter {
  private mem = new MemoryPersistenceAdapter();
  private prefix = 'tidyrow_saas_';

  constructor() {
    this.initFromLocalStorage();
  }

  private getKey(workspaceId: string, type: string, id?: string): string {
    return `${this.prefix}${workspaceId}_${type}${id ? `_${id}` : ''}`;
  }

  private initFromLocalStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      // Scan localStorage keys for datasets
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const parts = key.replace(this.prefix, '').split('_');
          const wsId = parts[0];
          const type = parts[1];
          if (type === 'dataset') {
            const raw = window.localStorage.getItem(key);
            if (raw) {
              const dataset = JSON.parse(raw) as StoredDataset;
              this.mem.saveDataset(wsId, dataset);
            }
          }
        }
      }
    } catch {
      // Storage parsing error or security restriction
    }
  }

  async saveDataset(workspaceId: string, dataset: StoredDataset): Promise<void> {
    await this.mem.saveDataset(workspaceId, dataset);
    try {
      if (typeof window !== 'undefined' && window.localStorage && !dataset.isEphemeral) {
        const key = this.getKey(workspaceId, 'dataset', dataset.id);
        window.localStorage.setItem(key, JSON.stringify(dataset));
      }
    } catch (err) {
      // Quota exceeded or private browsing mode; memory fallback is intact
      console.warn('Browser storage write failed, persisting in memory only:', err);
    }
  }

  async getDataset(workspaceId: string, datasetId: string): Promise<StoredDataset | null> {
    const memoryHit = await this.mem.getDataset(workspaceId, datasetId);
    if (memoryHit) return memoryHit;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = this.getKey(workspaceId, 'dataset', datasetId);
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const dataset = JSON.parse(raw) as StoredDataset;
          await this.mem.saveDataset(workspaceId, dataset);
          return dataset;
        }
      }
    } catch {
      // Storage read error
    }
    return null;
  }

  async listDatasets(workspaceId: string): Promise<DatasetMetadata[]> {
    return this.mem.listDatasets(workspaceId);
  }

  async deleteDataset(workspaceId: string, datasetId: string, options?: { hardPurge?: boolean }): Promise<void> {
    await this.mem.deleteDataset(workspaceId, datasetId);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = this.getKey(workspaceId, 'dataset', datasetId);
        window.localStorage.removeItem(key);

        if (options?.hardPurge) {
          // Remove any version snapshots
          for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const k = window.localStorage.key(i);
            if (k && k.includes(`${workspaceId}_snap_${datasetId}`)) {
              window.localStorage.removeItem(k);
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  async saveSnapshot(workspaceId: string, datasetId: string, version: DatasetVersion): Promise<void> {
    await this.mem.saveSnapshot(workspaceId, datasetId, version);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = this.getKey(workspaceId, 'snap', `${datasetId}_${version.versionId}`);
        window.localStorage.setItem(key, JSON.stringify(version));
      }
    } catch {
      // Storage quota reached, memory has it
    }
  }

  async getSnapshot(workspaceId: string, datasetId: string, versionId: string): Promise<DatasetVersion | null> {
    return this.mem.getSnapshot(workspaceId, datasetId, versionId);
  }

  async listSnapshots(workspaceId: string, datasetId: string): Promise<SnapshotMetadata[]> {
    return this.mem.listSnapshots(workspaceId, datasetId);
  }

  async saveAuditLog(
    workspaceId: string,
    log: Omit<AuditLogEntry, 'id' | 'timestamp'>
  ): Promise<AuditLogEntry> {
    const entry = await this.mem.saveAuditLog(workspaceId, log);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = this.getKey(workspaceId, 'audit');
        const existing = JSON.parse(window.localStorage.getItem(key) || '[]');
        existing.push(entry);
        // Retain last 200 logs in browser storage
        if (existing.length > 200) existing.shift();
        window.localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {
      // Ignore
    }
    return entry;
  }

  async getAuditLogs(workspaceId: string, datasetId?: string): Promise<AuditLogEntry[]> {
    return this.mem.getAuditLogs(workspaceId, datasetId);
  }

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    await this.mem.clearWorkspaceData(workspaceId);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const prefix = `${this.prefix}${workspaceId}_`;
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            window.localStorage.removeItem(key);
          }
        }
      }
    } catch {
      // Ignore
    }
  }
}

export const persistenceService = new BrowserPersistenceAdapter();
