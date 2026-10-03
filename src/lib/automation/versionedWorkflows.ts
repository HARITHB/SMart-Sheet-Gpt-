/**
 * TidyRow Versioned Saved Workflows
 * Step 5 of Automation & API Integrations Architecture
 * 
 * Provides:
 * - Immutable version history (v1, v2, v3...) for cleaning workflows
 * - Explicit changelogs and diff comparisons between versions
 * - Safe rollback / promotion of active versions
 * - Audit logging of every workflow execution with row count delta
 * - Headless execution strictly through trusted TidyRow core engine
 */

import { CleaningStep } from '../workflows';
import { migrateLegacyWorkflowToRecipe } from '../core/recipes';
import { applicationService, ApplicationCleanResponse } from './applicationService';
import { Principal } from '../saas/auth';
import { DatasetRow } from '../core/types';

export interface WorkflowVersionSnapshot {
  workflowId: string;
  versionNumber: number;
  changelog: string;
  steps: CleaningStep[];
  deterministic: boolean;
  createdBy: string;
  createdAt: string;
}

export interface VersionedWorkflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  targetDomain: 'crm' | 'ecommerce' | 'reviews' | 'general';
  activeVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionLog {
  id: string;
  workflowId: string;
  versionNumber: number;
  workspaceId: string;
  fileName: string;
  rowsBefore: number;
  rowsAfter: number;
  operationsCount: number;
  success: boolean;
  durationMs: number;
  executedAt: string;
  executedBy: string;
  error?: string;
}

export interface WorkflowVersionDiff {
  workflowId: string;
  versionA: number;
  versionB: number;
  addedSteps: CleaningStep[];
  removedSteps: CleaningStep[];
  modifiedSteps: { stepId: string; before: CleaningStep; after: CleaningStep }[];
}

export class VersionedWorkflowService {
  private workflows: Map<string, VersionedWorkflow> = new Map();
  private versions: Map<string, WorkflowVersionSnapshot[]> = new Map();
  private executionLogs: WorkflowExecutionLog[] = [];

  async createWorkflow(params: {
    workspaceId: string;
    name: string;
    description: string;
    targetDomain?: 'crm' | 'ecommerce' | 'reviews' | 'general';
    steps: CleaningStep[];
    createdBy: string;
    initialChangelog?: string;
  }): Promise<{ workflow: VersionedWorkflow; version: WorkflowVersionSnapshot }> {
    if (!params.steps || params.steps.length === 0) {
      throw new Error('Workflow must contain at least one cleaning step');
    }

    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const workflow: VersionedWorkflow = {
      id: workflowId,
      workspaceId: params.workspaceId,
      name: params.name,
      description: params.description,
      targetDomain: params.targetDomain || 'general',
      activeVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const isDeterministic = params.steps.every((s) => s.deterministic !== false);

    const versionSnapshot: WorkflowVersionSnapshot = {
      workflowId,
      versionNumber: 1,
      changelog: params.initialChangelog || 'Initial release (v1)',
      steps: JSON.parse(JSON.stringify(params.steps)),
      deterministic: isDeterministic,
      createdBy: params.createdBy,
      createdAt: now,
    };

    this.workflows.set(workflowId, workflow);
    this.versions.set(workflowId, [versionSnapshot]);

    return { workflow, version: versionSnapshot };
  }

  async createNewVersion(params: {
    workflowId: string;
    workspaceId: string;
    steps: CleaningStep[];
    changelog: string;
    createdBy: string;
    setAsActive?: boolean;
  }): Promise<WorkflowVersionSnapshot> {
    const workflow = this.workflows.get(params.workflowId);
    if (!workflow || workflow.workspaceId !== params.workspaceId) {
      throw new Error(`Workflow '${params.workflowId}' not found in workspace`);
    }

    if (!params.steps || params.steps.length === 0) {
      throw new Error('New workflow version must contain at least one step');
    }

    const existingVersions = this.versions.get(params.workflowId) || [];
    const nextVersionNumber = existingVersions.length + 1;
    const now = new Date().toISOString();
    const isDeterministic = params.steps.every((s) => s.deterministic !== false);

    const newSnapshot: WorkflowVersionSnapshot = {
      workflowId: params.workflowId,
      versionNumber: nextVersionNumber,
      changelog: params.changelog || `Version ${nextVersionNumber}`,
      steps: JSON.parse(JSON.stringify(params.steps)),
      deterministic: isDeterministic,
      createdBy: params.createdBy,
      createdAt: now,
    };

    existingVersions.push(newSnapshot);
    this.versions.set(params.workflowId, existingVersions);

    if (params.setAsActive !== false) {
      workflow.activeVersion = nextVersionNumber;
    }
    workflow.updatedAt = now;
    this.workflows.set(params.workflowId, workflow);

    return newSnapshot;
  }

  async setActiveVersion(workflowId: string, workspaceId: string, versionNumber: number): Promise<VersionedWorkflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.workspaceId !== workspaceId) {
      throw new Error(`Workflow '${workflowId}' not found in workspace`);
    }

    const versions = this.versions.get(workflowId) || [];
    const target = versions.find((v) => v.versionNumber === versionNumber);
    if (!target) {
      throw new Error(`Version ${versionNumber} does not exist for workflow '${workflowId}'`);
    }

    workflow.activeVersion = versionNumber;
    workflow.updatedAt = new Date().toISOString();
    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  async getWorkflow(workflowId: string, workspaceId: string): Promise<VersionedWorkflow | null> {
    const wf = this.workflows.get(workflowId);
    if (!wf || wf.workspaceId !== workspaceId) return null;
    return wf;
  }

  async getVersion(workflowId: string, versionNumber: number): Promise<WorkflowVersionSnapshot | null> {
    const list = this.versions.get(workflowId) || [];
    return list.find((v) => v.versionNumber === versionNumber) || null;
  }

  async listVersions(workflowId: string): Promise<WorkflowVersionSnapshot[]> {
    return (this.versions.get(workflowId) || []).slice().sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async listWorkflows(workspaceId: string): Promise<VersionedWorkflow[]> {
    return Array.from(this.workflows.values())
      .filter((w) => w.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  compareVersions(workflowId: string, versionA: number, versionB: number): WorkflowVersionDiff {
    const list = this.versions.get(workflowId) || [];
    const snapA = list.find((v) => v.versionNumber === versionA);
    const snapB = list.find((v) => v.versionNumber === versionB);

    if (!snapA || !snapB) {
      throw new Error(`Cannot compare: one or both versions (${versionA}, ${versionB}) not found`);
    }

    const mapA = new Map(snapA.steps.map((s) => [s.id, s]));
    const mapB = new Map(snapB.steps.map((s) => [s.id, s]));

    const addedSteps: CleaningStep[] = [];
    const removedSteps: CleaningStep[] = [];
    const modifiedSteps: { stepId: string; before: CleaningStep; after: CleaningStep }[] = [];

    for (const [id, stepB] of mapB.entries()) {
      if (!mapA.has(id)) {
        addedSteps.push(stepB);
      } else {
        const stepA = mapA.get(id)!;
        if (JSON.stringify(stepA) !== JSON.stringify(stepB)) {
          modifiedSteps.push({ stepId: id, before: stepA, after: stepB });
        }
      }
    }

    for (const [id, stepA] of mapA.entries()) {
      if (!mapB.has(id)) {
        removedSteps.push(stepA);
      }
    }

    return {
      workflowId,
      versionA,
      versionB,
      addedSteps,
      removedSteps,
      modifiedSteps,
    };
  }

  /**
   * Executes a versioned workflow against a dataset using the trusted TidyRow core engine.
   */
  async executeWorkflow(params: {
    workflowId: string;
    workspaceId: string;
    versionNumber?: number;
    principal: Principal;
    fileName: string;
    headers: string[];
    rows: DatasetRow[];
  }): Promise<ApplicationCleanResponse> {
    const workflow = await this.getWorkflow(params.workflowId, params.workspaceId);
    if (!workflow) {
      throw new Error(`Workflow '${params.workflowId}' not found in workspace`);
    }

    const versionNum = params.versionNumber || workflow.activeVersion;
    const versionSnapshot = await this.getVersion(params.workflowId, versionNum);
    if (!versionSnapshot) {
      throw new Error(`Version ${versionNum} not found for workflow '${params.workflowId}'`);
    }

    // Convert version steps into standard recipe for the trusted core
    const recipe = migrateLegacyWorkflowToRecipe({
      id: `${workflow.id}_v${versionNum}`,
      name: `${workflow.name} (v${versionNum})`,
      description: workflow.description,
      targetDomain: workflow.targetDomain,
      steps: versionSnapshot.steps,
      createdAt: versionSnapshot.createdAt,
    });

    const startTime = performance.now();
    let cleanResponse: ApplicationCleanResponse;
    let errorMsg: string | undefined;

    try {
      cleanResponse = await applicationService.cleanDataset({
        workspaceId: params.workspaceId,
        principal: params.principal,
        fileName: params.fileName,
        headers: params.headers,
        rows: params.rows,
        recipe,
        workflowId: workflow.id,
        workflowVersion: versionNum,
      });

      if (!cleanResponse.success) {
        errorMsg = cleanResponse.error || 'Workflow execution failed';
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Workflow execution threw unexpected error';
      throw err;
    } finally {
      const durationMs = performance.now() - startTime;
      const log: WorkflowExecutionLog = {
        id: `wfx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        workflowId: workflow.id,
        versionNumber: versionNum,
        workspaceId: params.workspaceId,
        fileName: params.fileName,
        rowsBefore: params.rows.length,
        rowsAfter: cleanResponse!?.version?.rows?.length ?? params.rows.length,
        operationsCount: versionSnapshot.steps.length,
        success: !errorMsg,
        durationMs,
        executedAt: new Date().toISOString(),
        executedBy: params.principal.email || params.principal.id,
        error: errorMsg,
      };

      this.executionLogs.unshift(log);
      if (this.executionLogs.length > 200) {
        this.executionLogs = this.executionLogs.slice(0, 200);
      }
    }

    return cleanResponse;
  }

  async listExecutions(workspaceId: string, workflowId?: string): Promise<WorkflowExecutionLog[]> {
    return this.executionLogs.filter((l) => {
      if (l.workspaceId !== workspaceId) return false;
      if (workflowId && l.workflowId !== workflowId) return false;
      return true;
    });
  }
}

export const versionedWorkflowService = new VersionedWorkflowService();
