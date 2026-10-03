/**
 * TidyRow Authenticated Job-Based API: API Key & Scopes Service
 * Step 2 of Automation & API Integrations Architecture
 */

import { Principal, WorkspaceRole } from '../saas/auth';

export type ApiScope =
  | 'data:read'
  | 'data:write'
  | 'data:clean'
  | 'jobs:read'
  | 'jobs:create'
  | 'jobs:cancel'
  | 'workflows:read'
  | 'workflows:execute'
  | 'webhooks:manage'
  | 'integrations:read'
  | 'integrations:sync'
  | 'schedules:manage';

export interface ApiKeyRecord {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string; // e.g. 'tr_live_a1b2' for identification
  keyHash: string;   // SHA-256 hash of the complete raw key
  scopes: ApiScope[];
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revoked: boolean;
  revokedAt?: string;
}

export interface GeneratedApiKey {
  rawKey: string; // Only returned ONCE at creation time
  record: ApiKeyRecord;
}

// Simple SHA-256 helper for browser/node compatibility
export async function sha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback synchronous hash for mock/test runs without subtle crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_hash_${Math.abs(hash).toString(16)}`;
}

export class ApiKeyService {
  private keys: Map<string, ApiKeyRecord> = new Map();

  async createApiKey(params: {
    workspaceId: string;
    name: string;
    scopes: ApiScope[];
    createdBy: string;
    expiresInDays?: number;
    environment?: 'live' | 'test';
  }): Promise<GeneratedApiKey> {
    const prefix = params.environment === 'test' ? 'tr_test' : 'tr_live';
    const randomBytes = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const rawKey = `${prefix}_${randomBytes}`;
    const keyHash = await sha256(rawKey);

    const id = `apk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
      : undefined;

    const record: ApiKeyRecord = {
      id,
      workspaceId: params.workspaceId,
      name: params.name,
      keyPrefix: rawKey.slice(0, 12),
      keyHash,
      scopes: params.scopes,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt,
      revoked: false,
    };

    this.keys.set(record.id, record);

    return {
      rawKey,
      record,
    };
  }

  async authenticate(rawKey: string): Promise<{ apiKey: ApiKeyRecord; principal: Principal }> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new ApiAuthenticationError('Missing or invalid Authorization API key');
    }

    const keyHash = await sha256(rawKey);
    const matchedKey = Array.from(this.keys.values()).find((k) => k.keyHash === keyHash);

    if (!matchedKey) {
      throw new ApiAuthenticationError('Invalid API key credentials');
    }

    if (matchedKey.revoked) {
      throw new ApiAuthenticationError(`API key '${matchedKey.name}' was revoked`);
    }

    if (matchedKey.expiresAt && new Date(matchedKey.expiresAt).getTime() < Date.now()) {
      throw new ApiAuthenticationError(`API key '${matchedKey.name}' has expired`);
    }

    // Update lastUsedAt
    matchedKey.lastUsedAt = new Date().toISOString();
    this.keys.set(matchedKey.id, matchedKey);

    // Form Principal mapped to a service_account role with scoped permissions
    const principal: Principal = {
      id: `sa_${matchedKey.id}`,
      email: `${matchedKey.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}@serviceaccount.tidyrow.internal`,
      name: `API Service Account (${matchedKey.name})`,
      type: 'service_account',
      role: 'service_account' as WorkspaceRole,
      status: 'active',
    };

    return { apiKey: matchedKey, principal };
  }

  assertScope(apiKey: ApiKeyRecord, requiredScope: ApiScope): void {
    if (!apiKey.scopes.includes(requiredScope)) {
      throw new ApiForbiddenError(
        `API key '${apiKey.name}' lacks required scope: '${requiredScope}'. Granted scopes: [${apiKey.scopes.join(', ')}]`
      );
    }
  }

  async revokeApiKey(keyId: string, workspaceId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key || key.workspaceId !== workspaceId) return false;
    key.revoked = true;
    key.revokedAt = new Date().toISOString();
    this.keys.set(keyId, key);
    return true;
  }

  async listApiKeys(workspaceId: string): Promise<ApiKeyRecord[]> {
    return Array.from(this.keys.values())
      .filter((k) => k.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export class ApiAuthenticationError extends Error {
  statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'ApiAuthenticationError';
  }
}

export class ApiForbiddenError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ApiForbiddenError';
  }
}

export const apiKeyService = new ApiKeyService();
