/**
 * SaaS Foundation: Centralized Usage Metering
 * Tracks consumption metrics, enforces tier quotas, and generates audit metrics.
 * 
 * EXTERNAL BOUNDARY NOTE:
 * External billing providers (Stripe, Chargebee) remain external.
 * This service tracks real consumption against workspace tier quotas,
 * provides threshold warnings (80% / 95%), and blocks unauthorized overages.
 */

import { WorkspaceTier, TIER_QUOTAS, WorkspaceQuota } from './workspace';

export type MeteredMetric =
  | 'rows_processed'
  | 'operations_executed'
  | 'ai_requests'
  | 'storage_bytes'
  | 'export_count';

export interface UsageRecord {
  id: string;
  workspaceId: string;
  actorId: string;
  metric: MeteredMetric;
  amount: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface QuotaStatus {
  metric: MeteredMetric;
  current: number;
  limit: number;
  percentUsed: number;
  warningLevel: 'ok' | 'warning_80' | 'critical_95' | 'exceeded_100';
  isBlocked: boolean;
}

export interface WorkspaceUsageSummary {
  workspaceId: string;
  tier: WorkspaceTier;
  period: string; // YYYY-MM
  rowsProcessed: number;
  operationsExecuted: number;
  aiRequests: number;
  storageBytes: number;
  exportCount: number;
  quotas: Record<MeteredMetric, QuotaStatus>;
}

export class QuotaExceededError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly metric: MeteredMetric,
    public readonly current: number,
    public readonly limit: number
  ) {
    super(
      `Quota exceeded for ${metric}: ${current}/${limit}. Upgrade tier or reduce usage to continue.`
    );
    this.name = 'QuotaExceededError';
  }
}

export class UsageMeteringService {
  private records: Map<string, UsageRecord[]> = new Map();
  private readonly storageKey = 'tidyrow_metering_records';

  constructor() {
    this.restoreFromStorage();
  }

  private getPeriodKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private restoreFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, UsageRecord[]>;
          Object.entries(parsed).forEach(([wsId, recs]) => {
            this.records.set(wsId, recs);
          });
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  private persist() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const obj = Object.fromEntries(this.records.entries());
        window.localStorage.setItem(this.storageKey, JSON.stringify(obj));
      }
    } catch {
      // Storage error
    }
  }

  async recordUsage(
    workspaceId: string,
    actorId: string,
    metric: MeteredMetric,
    amount: number,
    details?: Record<string, unknown>
  ): Promise<UsageRecord> {
    if (amount <= 0) {
      throw new Error('Usage amount must be greater than zero');
    }

    let wsRecords = this.records.get(workspaceId);
    if (!wsRecords) {
      wsRecords = [];
      this.records.set(workspaceId, wsRecords);
    }

    const record: UsageRecord = {
      id: `usg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId,
      actorId,
      metric,
      amount,
      timestamp: new Date().toISOString(),
      details,
    };

    wsRecords.push(record);
    // Keep most recent 5,000 records per workspace in memory/storage
    if (wsRecords.length > 5000) {
      wsRecords.splice(0, wsRecords.length - 5000);
    }

    this.persist();
    return record;
  }

  async checkQuota(
    workspaceId: string,
    tier: WorkspaceTier,
    metric: MeteredMetric,
    requestedAmount: number
  ): Promise<QuotaStatus> {
    const summary = await this.getUsageSummary(workspaceId, tier);
    const currentStatus = summary.quotas[metric];

    const projectedTotal = currentStatus.current + requestedAmount;
    const limit = currentStatus.limit;
    const percentUsed = limit > 0 ? (projectedTotal / limit) * 100 : 0;

    let warningLevel: QuotaStatus['warningLevel'] = 'ok';
    let isBlocked = false;

    if (percentUsed >= 100) {
      warningLevel = 'exceeded_100';
      isBlocked = true;
    } else if (percentUsed >= 95) {
      warningLevel = 'critical_95';
    } else if (percentUsed >= 80) {
      warningLevel = 'warning_80';
    }

    return {
      metric,
      current: projectedTotal,
      limit,
      percentUsed,
      warningLevel,
      isBlocked,
    };
  }

  async requireQuota(
    workspaceId: string,
    tier: WorkspaceTier,
    metric: MeteredMetric,
    requestedAmount: number
  ): Promise<void> {
    const check = await this.checkQuota(workspaceId, tier, metric, requestedAmount);
    if (check.isBlocked) {
      throw new QuotaExceededError(workspaceId, metric, check.current, check.limit);
    }
  }

  async getUsageSummary(
    workspaceId: string,
    tier: WorkspaceTier = 'starter',
    period = this.getPeriodKey()
  ): Promise<WorkspaceUsageSummary> {
    const quota: WorkspaceQuota = TIER_QUOTAS[tier];
    const wsRecords = this.records.get(workspaceId) || [];

    // Filter records by current period (YYYY-MM)
    const currentPeriodRecords = wsRecords.filter((r) => r.timestamp.startsWith(period));

    let rowsProcessed = 0;
    let operationsExecuted = 0;
    let aiRequests = 0;
    let storageBytes = 0;
    let exportCount = 0;

    for (const r of currentPeriodRecords) {
      switch (r.metric) {
        case 'rows_processed':
          rowsProcessed += r.amount;
          break;
        case 'operations_executed':
          operationsExecuted += r.amount;
          break;
        case 'ai_requests':
          aiRequests += r.amount;
          break;
        case 'storage_bytes':
          // Storage bytes is tracked as latest watermark
          storageBytes = Math.max(storageBytes, r.amount);
          break;
        case 'export_count':
          exportCount += r.amount;
          break;
      }
    }

    const calcStatus = (metric: MeteredMetric, current: number, limit: number): QuotaStatus => {
      const percentUsed = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
      let warningLevel: QuotaStatus['warningLevel'] = 'ok';
      if (percentUsed >= 100) warningLevel = 'exceeded_100';
      else if (percentUsed >= 95) warningLevel = 'critical_95';
      else if (percentUsed >= 80) warningLevel = 'warning_80';

      return {
        metric,
        current,
        limit,
        percentUsed,
        warningLevel,
        isBlocked: current > limit,
      };
    };

    const quotas: Record<MeteredMetric, QuotaStatus> = {
      rows_processed: calcStatus('rows_processed', rowsProcessed, quota.maxRowsPerDataset * 5),
      operations_executed: calcStatus('operations_executed', operationsExecuted, quota.maxJobsPerMonth * 10),
      ai_requests: calcStatus('ai_requests', aiRequests, quota.allowAiTransform ? 500 : 0),
      storage_bytes: calcStatus('storage_bytes', storageBytes, quota.maxStorageBytes),
      export_count: calcStatus('export_count', exportCount, 1000),
    };

    return {
      workspaceId,
      tier,
      period,
      rowsProcessed,
      operationsExecuted,
      aiRequests,
      storageBytes,
      exportCount,
      quotas,
    };
  }

  async resetWorkspaceUsage(workspaceId: string): Promise<void> {
    this.records.delete(workspaceId);
    this.persist();
  }
}

export const meteringService = new UsageMeteringService();
