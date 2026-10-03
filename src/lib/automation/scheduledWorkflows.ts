/**
 * TidyRow Scheduled Workflows Engine
 * Step 9 of Automation & API Integrations Architecture
 * 
 * Provides:
 * - Recurring schedule definitions (hourly, daily, weekly, custom cron)
 * - Due-time evaluation and next-run calculations
 * - Automated background execution through trusted application service
 * - Execution history logging and status tracking
 */

import { versionedWorkflowService } from './versionedWorkflows';
import { webhookService } from './webhookService';
import { Principal, WorkspaceRole } from '../saas/auth';
import { DatasetRow } from '../core/types';

export type ScheduleCadence = 'hourly' | 'daily' | 'weekly' | 'custom_cron';

export interface WorkflowSchedule {
  id: string;
  workspaceId: string;
  name: string;
  workflowId: string;
  workflowVersion?: number;
  cadence: ScheduleCadence;
  cronExpression?: string; // e.g. "0 * * * *" or "0 0 * * *"
  timezone: string;
  enabled: boolean;
  sourceConfig: {
    type: 'sample' | 'integration' | 'url';
    providerId?: string;
    datasetName?: string;
    staticSampleData?: { headers: string[]; rows: DatasetRow[] };
  };
  destinationConfig?: {
    type: 'webhook' | 'integration' | 'archive';
    targetUrl?: string;
  };
  lastRunAt?: string;
  nextRunAt: string;
  lastStatus?: 'success' | 'failed';
  lastError?: string;
  createdAt: string;
}

export interface ScheduleExecutionLog {
  id: string;
  scheduleId: string;
  workspaceId: string;
  workflowId: string;
  executedAt: string;
  durationMs: number;
  success: boolean;
  rowsProcessed: number;
  rowsResult: number;
  error?: string;
}

export function computeNextRun(cadence: ScheduleCadence, fromDate = new Date()): Date {
  const next = new Date(fromDate.getTime());
  switch (cadence) {
    case 'hourly':
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      next.setHours(0, 0, 0, 0);
      break;
    case 'custom_cron':
    default:
      // Default to 24h increment for custom cron simulation
      next.setDate(next.getDate() + 1);
      break;
  }
  return next;
}

export class ScheduledWorkflowService {
  private schedules: Map<string, WorkflowSchedule> = new Map();
  private executionLogs: ScheduleExecutionLog[] = [];

  async createSchedule(params: {
    workspaceId: string;
    name: string;
    workflowId: string;
    workflowVersion?: number;
    cadence: ScheduleCadence;
    cronExpression?: string;
    timezone?: string;
    sourceConfig: WorkflowSchedule['sourceConfig'];
    destinationConfig?: WorkflowSchedule['destinationConfig'];
  }): Promise<WorkflowSchedule> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    const nextRun = computeNextRun(params.cadence, now).toISOString();

    const schedule: WorkflowSchedule = {
      id,
      workspaceId: params.workspaceId,
      name: params.name,
      workflowId: params.workflowId,
      workflowVersion: params.workflowVersion,
      cadence: params.cadence,
      cronExpression: params.cronExpression || (params.cadence === 'hourly' ? '0 * * * *' : '0 0 * * *'),
      timezone: params.timezone || 'UTC',
      enabled: true,
      sourceConfig: params.sourceConfig,
      destinationConfig: params.destinationConfig,
      nextRunAt: nextRun,
      createdAt: now.toISOString(),
    };

    this.schedules.set(id, schedule);
    return schedule;
  }

  async getSchedule(scheduleId: string, workspaceId: string): Promise<WorkflowSchedule | null> {
    const s = this.schedules.get(scheduleId);
    if (!s || s.workspaceId !== workspaceId) return null;
    return s;
  }

  async listSchedules(workspaceId: string): Promise<WorkflowSchedule[]> {
    return Array.from(this.schedules.values())
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());
  }

  async toggleSchedule(scheduleId: string, workspaceId: string, enabled: boolean): Promise<WorkflowSchedule | null> {
    const s = this.schedules.get(scheduleId);
    if (!s || s.workspaceId !== workspaceId) return null;
    s.enabled = enabled;
    if (enabled && new Date(s.nextRunAt).getTime() < Date.now()) {
      s.nextRunAt = computeNextRun(s.cadence).toISOString();
    }
    this.schedules.set(scheduleId, s);
    return s;
  }

  async deleteSchedule(scheduleId: string, workspaceId: string): Promise<boolean> {
    const s = this.schedules.get(scheduleId);
    if (!s || s.workspaceId !== workspaceId) return false;
    this.schedules.delete(scheduleId);
    return true;
  }

  /**
   * Executes a scheduled workflow immediately or when due.
   * Runs strictly via the trusted TidyRow core engine.
   */
  async runSchedule(scheduleId: string, asOfDate = new Date()): Promise<ScheduleExecutionLog> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule '${scheduleId}' not found.`);
    }

    const startTime = performance.now();
    const executedAt = asOfDate.toISOString();

    // Fabricate service account principal for the schedule executor
    const principal: Principal = {
      id: `sched_runner_${schedule.id}`,
      email: `cron_${schedule.id}@scheduled.tidyrow.internal`,
      name: `Scheduled Worker: ${schedule.name}`,
      type: 'service_account',
      role: 'service_account' as WorkspaceRole,
      status: 'active',
    };

    // Obtain dataset from source config
    const sourceData = schedule.sourceConfig.staticSampleData || {
      headers: ['id', 'company', 'email', 'created_at'],
      rows: [
        { _tr_id: 'r_sched_1', id: '1', company: '  Acme Corp  ', email: 'alice@acme.com', created_at: '2026-01-01' },
        { _tr_id: 'r_sched_2', id: '2', company: 'Beta LLC', email: 'bob@beta.io', created_at: '2026-01-02' },
      ],
    };

    let success = false;
    let errorMsg: string | undefined;
    let rowsResult = sourceData.rows.length;

    try {
      const cleanRes = await versionedWorkflowService.executeWorkflow({
        workflowId: schedule.workflowId,
        workspaceId: schedule.workspaceId,
        versionNumber: schedule.workflowVersion,
        principal,
        fileName: schedule.sourceConfig.datasetName || `${schedule.name.toLowerCase().replace(/\s+/g, '_')}.csv`,
        headers: sourceData.headers,
        rows: sourceData.rows,
      });

      if (cleanRes.success && cleanRes.version) {
        success = true;
        rowsResult = cleanRes.version.rows.length;
      } else {
        errorMsg = cleanRes.error || 'Invariant validation failed during scheduled run';
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Unexpected execution error in scheduled workflow';
    }

    const durationMs = performance.now() - startTime;

    // Update schedule state
    schedule.lastRunAt = executedAt;
    schedule.lastStatus = success ? 'success' : 'failed';
    schedule.lastError = errorMsg;
    schedule.nextRunAt = computeNextRun(schedule.cadence, asOfDate).toISOString();
    this.schedules.set(schedule.id, schedule);

    const log: ScheduleExecutionLog = {
      id: `sclog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      scheduleId: schedule.id,
      workspaceId: schedule.workspaceId,
      workflowId: schedule.workflowId,
      executedAt,
      durationMs,
      success,
      rowsProcessed: sourceData.rows.length,
      rowsResult,
      error: errorMsg,
    };

    this.executionLogs.unshift(log);
    if (this.executionLogs.length > 200) {
      this.executionLogs = this.executionLogs.slice(0, 200);
    }

    // Dispatch webhook event
    await webhookService.dispatchEvent(schedule.workspaceId, 'workflow.executed', {
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      success,
      rowsProcessed: sourceData.rows.length,
      rowsResult,
      durationMs,
    });

    return log;
  }

  /**
   * Sweeps and executes any enabled schedules that have reached or passed their nextRunAt timestamp.
   */
  async sweepAndExecuteDueSchedules(currentTime = new Date()): Promise<ScheduleExecutionLog[]> {
    const executed: ScheduleExecutionLog[] = [];
    const nowMs = currentTime.getTime();

    for (const schedule of this.schedules.values()) {
      if (schedule.enabled && new Date(schedule.nextRunAt).getTime() <= nowMs) {
        const log = await this.runSchedule(schedule.id, currentTime);
        executed.push(log);
      }
    }

    return executed;
  }

  async listExecutionLogs(workspaceId: string, scheduleId?: string): Promise<ScheduleExecutionLog[]> {
    return this.executionLogs.filter((l) => {
      if (l.workspaceId !== workspaceId) return false;
      if (scheduleId && l.scheduleId !== scheduleId) return false;
      return true;
    });
  }
}

export const scheduledWorkflowService = new ScheduledWorkflowService();
