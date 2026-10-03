/**
 * SaaS Foundation: Authentication Boundary & RBAC
 * Defines principals, sessions, permissions, roles, and authorization boundaries.
 * 
 * EXTERNAL BOUNDARY NOTE:
 * External Identity Providers (OIDC, SAML, OAuth2, Firebase Auth) remain external.
 * This module defines the domain interfaces and a local token & RBAC adapter
 * that enforces authorization server-side or client-side without faking network calls.
 */

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'service_account';

export type Permission =
  // Workspace management
  | 'workspace:view'
  | 'workspace:manage'
  | 'workspace:invite'
  | 'workspace:delete'
  // Data operations
  | 'data:view'
  | 'data:edit'
  | 'data:clean'
  | 'data:export'
  | 'data:delete'
  // Background Jobs
  | 'job:view'
  | 'job:create'
  | 'job:cancel'
  // Audit & Governance
  | 'audit:view'
  | 'quota:manage'
  | 'privacy:manage';

export interface Principal {
  id: string;
  email: string;
  name: string;
  type: 'user' | 'service_account' | 'system';
  role: WorkspaceRole;
  status: 'active' | 'suspended';
  metadata?: Record<string, unknown>;
}

export interface AuthSession {
  sessionId: string;
  principal: Principal;
  workspaceId: string;
  token: string;
  expiresAt: number; // Unix timestamp ms
  createdAt: number; // Unix timestamp ms
}

export class AuthorizationError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly role: WorkspaceRole,
    message?: string
  ) {
    super(message || `Access denied: Role '${role}' lacks permission '${permission}'`);
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Standard Role-to-Permissions Mapping
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: [
    'workspace:view',
    'workspace:manage',
    'workspace:invite',
    'workspace:delete',
    'data:view',
    'data:edit',
    'data:clean',
    'data:export',
    'data:delete',
    'job:view',
    'job:create',
    'job:cancel',
    'audit:view',
    'quota:manage',
    'privacy:manage',
  ],
  admin: [
    'workspace:view',
    'workspace:manage',
    'workspace:invite',
    'data:view',
    'data:edit',
    'data:clean',
    'data:export',
    'data:delete',
    'job:view',
    'job:create',
    'job:cancel',
    'audit:view',
    'quota:manage',
    'privacy:manage',
  ],
  editor: [
    'workspace:view',
    'data:view',
    'data:edit',
    'data:clean',
    'data:export',
    'job:view',
    'job:create',
    'job:cancel',
  ],
  viewer: [
    'workspace:view',
    'data:view',
    'job:view',
    'audit:view',
  ],
  service_account: [
    'workspace:view',
    'data:view',
    'data:edit',
    'data:clean',
    'data:export',
    'job:view',
    'job:create',
  ],
};

/**
 * Auth Adapter Interface
 */
export interface AuthAdapter {
  getCurrentSession(): Promise<AuthSession | null>;
  verifyToken(token: string): Promise<Principal | null>;
  checkPermission(session: AuthSession, permission: Permission): boolean;
  requirePermission(session: AuthSession, permission: Permission): void;
  login(params: { email: string; name?: string; role?: WorkspaceRole; workspaceId?: string }): Promise<AuthSession>;
  logout(): Promise<void>;
  switchWorkspace(workspaceId: string): Promise<AuthSession>;
  switchRole(role: WorkspaceRole): Promise<AuthSession>;
}

/**
 * Local & Standalone Auth Adapter
 * Provides robust token issuance, expiration, and strict RBAC verification.
 */
export class LocalAuthAdapter implements AuthAdapter {
  private currentSession: AuthSession | null = null;
  private readonly storageKey = 'tidyrow_auth_session';

  constructor() {
    this.restoreStoredSession();
  }

  private restoreStoredSession() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as AuthSession;
          if (parsed && parsed.expiresAt > Date.now()) {
            this.currentSession = parsed;
            return;
          }
        }
      }
    } catch {
      // Ignore storage errors, default to null
    }

    // Default development session if no stored valid session
    this.currentSession = this.createDefaultSession('owner');
  }

  private persistSession(session: AuthSession | null) {
    this.currentSession = session;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (session) {
          window.localStorage.setItem(this.storageKey, JSON.stringify(session));
        } else {
          window.localStorage.removeItem(this.storageKey);
        }
      }
    } catch {
      // Storage unavailable or disabled
    }
  }

  private createDefaultSession(role: WorkspaceRole, workspaceId = 'ws_default'): AuthSession {
    const now = Date.now();
    const principal: Principal = {
      id: `usr_${role}_${Math.random().toString(36).slice(2, 8)}`,
      email: `${role}@tidyrow.local`,
      name: role.charAt(0).toUpperCase() + role.slice(1) + ' User',
      type: role === 'service_account' ? 'service_account' : 'user',
      role,
      status: 'active',
    };

    return {
      sessionId: `sess_${now}_${Math.random().toString(36).slice(2, 9)}`,
      principal,
      workspaceId,
      token: `tr_tok_${btoa(JSON.stringify({ uid: principal.id, role, exp: now + 86400000 }))}`,
      createdAt: now,
      expiresAt: now + 86400000, // 24 hours
    };
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    if (!this.currentSession) return null;
    if (this.currentSession.expiresAt <= Date.now()) {
      this.persistSession(null);
      return null;
    }
    return this.currentSession;
  }

  async verifyToken(token: string): Promise<Principal | null> {
    if (!token || !token.startsWith('tr_tok_')) return null;
    try {
      const payloadBase64 = token.replace('tr_tok_', '');
      const decoded = JSON.parse(atob(payloadBase64));
      if (!decoded.uid || !decoded.role || decoded.exp <= Date.now()) {
        return null;
      }
      if (this.currentSession && this.currentSession.principal.id === decoded.uid) {
        return this.currentSession.principal;
      }
      return {
        id: decoded.uid,
        email: `${decoded.role}@tidyrow.local`,
        name: `${decoded.role} Actor`,
        type: decoded.role === 'service_account' ? 'service_account' : 'user',
        role: decoded.role as WorkspaceRole,
        status: 'active',
      };
    } catch {
      return null;
    }
  }

  checkPermission(session: AuthSession, permission: Permission): boolean {
    if (!session || session.expiresAt <= Date.now()) return false;
    const allowed = ROLE_PERMISSIONS[session.principal.role] || [];
    return allowed.includes(permission);
  }

  assertPrincipalPermission(principal: Principal, permission: Permission): void {
    const allowed = ROLE_PERMISSIONS[principal.role] || [];
    if (!allowed.includes(permission)) {
      throw new AuthorizationError(permission, principal.role);
    }
  }

  requirePermission(session: AuthSession, permission: Permission): void {
    if (!session || session.expiresAt <= Date.now()) {
      throw new AuthenticationError('Session is missing or expired');
    }
    if (!this.checkPermission(session, permission)) {
      throw new AuthorizationError(permission, session.principal.role);
    }
  }

  async login(params: {
    email: string;
    name?: string;
    role?: WorkspaceRole;
    workspaceId?: string;
  }): Promise<AuthSession> {
    const role = params.role || 'owner';
    const now = Date.now();
    const principal: Principal = {
      id: `usr_${Math.random().toString(36).slice(2, 9)}`,
      email: params.email,
      name: params.name || params.email.split('@')[0],
      type: role === 'service_account' ? 'service_account' : 'user',
      role,
      status: 'active',
    };

    const session: AuthSession = {
      sessionId: `sess_${now}_${Math.random().toString(36).slice(2, 9)}`,
      principal,
      workspaceId: params.workspaceId || 'ws_default',
      token: `tr_tok_${btoa(JSON.stringify({ uid: principal.id, role, exp: now + 86400000 }))}`,
      createdAt: now,
      expiresAt: now + 86400000,
    };

    this.persistSession(session);
    return session;
  }

  async logout(): Promise<void> {
    this.persistSession(null);
  }

  async switchWorkspace(workspaceId: string): Promise<AuthSession> {
    const current = await this.getCurrentSession();
    if (!current) throw new AuthenticationError('Not authenticated');

    const updated: AuthSession = {
      ...current,
      workspaceId,
    };
    this.persistSession(updated);
    return updated;
  }

  async switchRole(role: WorkspaceRole): Promise<AuthSession> {
    const current = await this.getCurrentSession();
    if (!current) throw new AuthenticationError('Not authenticated');

    const now = Date.now();
    const updatedPrincipal: Principal = {
      ...current.principal,
      role,
      type: role === 'service_account' ? 'service_account' : 'user',
    };

    const updated: AuthSession = {
      ...current,
      principal: updatedPrincipal,
      token: `tr_tok_${btoa(JSON.stringify({ uid: updatedPrincipal.id, role, exp: now + 86400000 }))}`,
    };

    this.persistSession(updated);
    return updated;
  }
}

// Global default singleton auth instance
export const authService = new LocalAuthAdapter();
