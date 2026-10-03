/**
 * TidyRow Idempotency Engine
 * Step 3 of Automation & API Integrations Architecture
 * 
 * Ensures non-duplication of mutations, safe retries for unstable network clients,
 * and deterministic re-delivery of job results.
 */

import { sha256 } from './apiKeyService';

export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

export interface IdempotencyRecord<TResponse = any> {
  key: string;
  workspaceId: string;
  requestFingerprint: string;
  status: IdempotencyStatus;
  statusCode: number;
  responseBody?: TResponse;
  jobId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export class IdempotencyConflictError extends Error {
  statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyInFlightError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyInFlightError';
  }
}

export class IdempotencyService {
  private cache: Map<string, IdempotencyRecord> = new Map();
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  private makeStorageKey(workspaceId: string, idempotencyKey: string): string {
    return `${workspaceId}::${idempotencyKey}`;
  }

  async computeFingerprint(endpoint: string, payload: any): Promise<string> {
    const canonicalPayload = JSON.stringify(payload, Object.keys(payload || {}).sort());
    return sha256(`${endpoint}:::${canonicalPayload}`);
  }

  /**
   * Evaluates incoming request against idempotency store.
   * If existing completed request matches fingerprint: returns cached response.
   * If in-flight: throws 409 error.
   * If key reused with different payload: throws 422 conflict.
   * If new: reserves the key with status 'processing'.
   */
  async acquireOrLookup<T>(
    workspaceId: string,
    idempotencyKey: string,
    endpoint: string,
    payload: any
  ): Promise<{ isReplay: boolean; cachedResponse?: { statusCode: number; body: T } }> {
    const storageKey = this.makeStorageKey(workspaceId, idempotencyKey);
    const existing = this.cache.get(storageKey);
    const fingerprint = await this.computeFingerprint(endpoint, payload);

    if (existing) {
      // Check expiration
      if (new Date(existing.expiresAt).getTime() < Date.now()) {
        this.cache.delete(storageKey);
      } else {
        // Verify payload fingerprint match
        if (existing.requestFingerprint !== fingerprint) {
          throw new IdempotencyConflictError(
            `Idempotency key '${idempotencyKey}' was already used with a different request payload or endpoint.`
          );
        }

        if (existing.status === 'processing') {
          throw new IdempotencyInFlightError(
            `A request with idempotency key '${idempotencyKey}' is currently in-flight. Please poll the existing job.`
          );
        }

        if (existing.status === 'completed') {
          return {
            isReplay: true,
            cachedResponse: {
              statusCode: existing.statusCode,
              body: existing.responseBody,
            },
          };
        }
      }
    }

    // Reserve key
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultTtlMs).toISOString();
    const record: IdempotencyRecord = {
      key: idempotencyKey,
      workspaceId,
      requestFingerprint: fingerprint,
      status: 'processing',
      statusCode: 202,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
    };

    this.cache.set(storageKey, record);
    return { isReplay: false };
  }

  async markCompleted<T>(
    workspaceId: string,
    idempotencyKey: string,
    statusCode: number,
    responseBody: T,
    jobId?: string
  ): Promise<void> {
    const storageKey = this.makeStorageKey(workspaceId, idempotencyKey);
    const record = this.cache.get(storageKey);
    if (!record) return;

    record.status = 'completed';
    record.statusCode = statusCode;
    record.responseBody = responseBody;
    record.jobId = jobId;
    record.updatedAt = new Date().toISOString();
    this.cache.set(storageKey, record);
  }

  async markFailed(
    workspaceId: string,
    idempotencyKey: string,
    statusCode: number,
    error: string
  ): Promise<void> {
    const storageKey = this.makeStorageKey(workspaceId, idempotencyKey);
    const record = this.cache.get(storageKey);
    if (!record) return;

    record.status = 'failed';
    record.statusCode = statusCode;
    record.error = error;
    record.updatedAt = new Date().toISOString();
    this.cache.set(storageKey, record);
  }

  async getRecord(workspaceId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const storageKey = this.makeStorageKey(workspaceId, idempotencyKey);
    return this.cache.get(storageKey) || null;
  }

  clearForTesting(): void {
    this.cache.clear();
  }
}

export const idempotencyService = new IdempotencyService();
