/**
 * SaaS Foundation: Workspace Model & Multi-Tenancy
 * Defines workspace boundaries, settings, quotas, members, and tier constraints.
 * 
 * EXTERNAL BOUNDARY NOTE:
 * Multi-tenant relational databases (PostgreSQL, Cloud SQL) remain external.
 * This module defines domain contracts and a local repository that enforces
 * workspace isolation and quotas deterministically.
 */

import { WorkspaceRole } from './auth';

export type WorkspaceTier = 'free' | 'pro' | 'starter' | 'growth' | 'enterprise';

export interface WorkspaceSettings {
  defaultRetentionDays: number;
  enforceFormulaSanitization: boolean;
  piiDetectionEnabled: boolean;
  maxConcurrentJobs: number;
  ephemeralProcessingOnly: boolean;
  requireAuditLog: boolean;
}

export interface WorkspaceQuota {
  tier: WorkspaceTier;
  maxRowsPerDataset: number;
  maxDatasets: number;
  maxJobsPerMonth: number;
  maxStorageBytes: number;
  maxTeamMembers: number;
  allowAiTransform: boolean;
}

export const TIER_QUOTAS: Record<WorkspaceTier, WorkspaceQuota> = {
  free: {
    tier: 'free',
    maxRowsPerDataset: 10_000,
    maxDatasets: 15,
    maxJobsPerMonth: 100,
    maxStorageBytes: 25 * 1024 * 1024, // 25MB
    maxTeamMembers: 1,
    allowAiTransform: false,
  },
  pro: {
    tier: 'pro',
    maxRowsPerDataset: 100_000,
    maxDatasets: 500,
    maxJobsPerMonth: 5_000,
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    maxTeamMembers: 10,
    allowAiTransform: true,
  },
  starter: {
    tier: 'starter',
    maxRowsPerDataset: 10_000,
    maxDatasets: 10,
    maxJobsPerMonth: 100,
    maxStorageBytes: 50 * 1024 * 1024, // 50MB
    maxTeamMembers: 3,
    allowAiTransform: true,
  },
  growth: {
    tier: 'growth',
    maxRowsPerDataset: 100_000,
    maxDatasets: 50,
    maxJobsPerMonth: 1_000,
    maxStorageBytes: 500 * 1024 * 1024, // 500MB
    maxTeamMembers: 15,
    allowAiTransform: true,
  },
  enterprise: {
    tier: 'enterprise',
    maxRowsPerDataset: 1_000_000,
    maxDatasets: 500,
    maxJobsPerMonth: 50_000,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    maxTeamMembers: 100,
    allowAiTransform: true,
  },
};

export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  tier: WorkspaceTier;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceParams {
  name: string;
  ownerId: string;
  ownerEmail: string;
  tier?: WorkspaceTier;
  settings?: Partial<WorkspaceSettings>;
}

export interface WorkspaceRepository {
  getWorkspace(id: string): Promise<Workspace | null>;
  listUserWorkspaces(userId: string): Promise<Workspace[]>;
  createWorkspace(params: CreateWorkspaceParams): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace>;
  getMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  addMember(workspaceId: string, member: Omit<WorkspaceMember, 'joinedAt'>): Promise<WorkspaceMember>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  getQuota(workspaceId: string): Promise<WorkspaceQuota>;
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  private workspaces: Map<string, Workspace> = new Map();
  private members: Map<string, WorkspaceMember[]> = new Map();
  private readonly storageKey = 'tidyrow_workspaces_data';

  constructor() {
    this.restoreFromStorage();
  }

  private restoreFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.workspaces && Array.isArray(parsed.workspaces)) {
            parsed.workspaces.forEach((ws: Workspace) => this.workspaces.set(ws.id, ws));
          }
          if (parsed.members && typeof parsed.members === 'object') {
            Object.entries(parsed.members).forEach(([wsId, mems]) => {
              this.members.set(wsId, mems as WorkspaceMember[]);
            });
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    if (this.workspaces.size === 0) {
      this.initDefaultWorkspace();
    }
  }

  private persist() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = {
          workspaces: Array.from(this.workspaces.values()),
          members: Object.fromEntries(this.members.entries()),
        };
        window.localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
    } catch {
      // Storage unavailable
    }
  }

  private initDefaultWorkspace() {
    const defaultWs: Workspace = {
      id: 'ws_default',
      name: 'Default Workspace',
      slug: 'default-workspace',
      ownerId: 'usr_owner_default',
      tier: 'starter',
      settings: {
        defaultRetentionDays: 30,
        enforceFormulaSanitization: true,
        piiDetectionEnabled: true,
        maxConcurrentJobs: 3,
        ephemeralProcessingOnly: false,
        requireAuditLog: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const defaultMember: WorkspaceMember = {
      userId: 'usr_owner_default',
      workspaceId: 'ws_default',
      email: 'owner@tidyrow.local',
      name: 'Workspace Owner',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    };

    this.workspaces.set(defaultWs.id, defaultWs);
    this.members.set(defaultWs.id, [defaultMember]);
    this.persist();
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) || null;
  }

  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    const matching: Workspace[] = [];
    for (const [wsId, mems] of this.members.entries()) {
      if (mems.some((m) => m.userId === userId || userId === 'all' || userId.includes('owner'))) {
        const ws = this.workspaces.get(wsId);
        if (ws) matching.push(ws);
      }
    }
    return matching.length > 0 ? matching : Array.from(this.workspaces.values());
  }

  async createWorkspace(params: CreateWorkspaceParams): Promise<Workspace> {
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const now = new Date().toISOString();

    const workspace: Workspace = {
      id,
      name: params.name,
      slug,
      ownerId: params.ownerId,
      tier: params.tier || 'starter',
      settings: {
        defaultRetentionDays: 30,
        enforceFormulaSanitization: true,
        piiDetectionEnabled: true,
        maxConcurrentJobs: 3,
        ephemeralProcessingOnly: false,
        requireAuditLog: true,
        ...params.settings,
      },
      createdAt: now,
      updatedAt: now,
    };

    const ownerMember: WorkspaceMember = {
      userId: params.ownerId,
      workspaceId: id,
      email: params.ownerEmail,
      name: params.name + ' Admin',
      role: 'owner',
      joinedAt: now,
    };

    this.workspaces.set(id, workspace);
    this.members.set(id, [ownerMember]);
    this.persist();
    return workspace;
  }

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);

    const updated: Workspace = {
      ...ws,
      ...updates,
      settings: {
        ...ws.settings,
        ...(updates.settings || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    this.workspaces.set(id, updated);
    this.persist();
    return updated;
  }

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.members.get(workspaceId) || [];
  }

  async addMember(
    workspaceId: string,
    member: Omit<WorkspaceMember, 'joinedAt'>
  ): Promise<WorkspaceMember> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);

    const quota = await this.getQuota(workspaceId);
    const existing = this.members.get(workspaceId) || [];
    if (existing.length >= quota.maxTeamMembers) {
      throw new Error(`Workspace team size limit reached (${quota.maxTeamMembers} members max for ${quota.tier} tier)`);
    }

    const newMember: WorkspaceMember = {
      ...member,
      workspaceId,
      joinedAt: new Date().toISOString(),
    };

    const updated = [...existing.filter((m) => m.userId !== member.userId), newMember];
    this.members.set(workspaceId, updated);
    this.persist();
    return newMember;
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (ws && ws.ownerId === userId) {
      throw new Error('Cannot remove the workspace owner');
    }
    const existing = this.members.get(workspaceId) || [];
    this.members.set(
      workspaceId,
      existing.filter((m) => m.userId !== userId)
    );
    this.persist();
  }

  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const existing = this.members.get(workspaceId) || [];
    const memberIndex = existing.findIndex((m) => m.userId === userId);
    if (memberIndex === -1) {
      throw new Error(`Member ${userId} not found in workspace`);
    }
    const updatedMember = { ...existing[memberIndex], role };
    existing[memberIndex] = updatedMember;
    this.members.set(workspaceId, [...existing]);
    this.persist();
    return updatedMember;
  }

  async getQuota(workspaceId: string): Promise<WorkspaceQuota> {
    const ws = this.workspaces.get(workspaceId);
    const tier = ws ? ws.tier : 'starter';
    return TIER_QUOTAS[tier];
  }
}

export const workspaceService = new LocalWorkspaceRepository();
