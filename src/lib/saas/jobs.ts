/**
 * SaaS Foundation: Background-Job Abstraction
 * Asynchronous job queue and execution engine.
 * 
 * SHARED ENGINE REQUIREMENT:
 * Ensures the data cleaning engine (recipes, transactions, invariants, entity resolution)
 * is headless and shared seamlessly between reactive UI actions and background worker jobs.
 * 
 * EXTERNAL BOUNDARY NOTE:
 * Distributed message brokers (RabbitMQ, Redis Celery, Google Cloud Tasks) remain external.
 * This adapter provides typed domain contracts, cooperative client/worker scheduling,
 * live progress eventing, and cancellation tokens.
 */

import { DatasetVersion } from '../core/types';
import { CleaningRecipe } from '../core/recipes';
import { executeRecipe } from '../core/recipes';
import { resolveEntities, EntityResolutionReport } from '../core/entityResolution';
import { validatePostClean, PostCleanValidationResult } from '../core/postCleanValidator';
import { validateDatasetInvariants } from '../core/invariants';

export type JobType =
  | 'clean_dataset'
  | 'execute_recipe'
  | 'resolve_entities'
  | 'validate_dataset'
  | 'export_dataset';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
  percent: number;
  stage: string;
  processedRows?: number;
  totalRows?: number;
}

export interface BackgroundJob<TParams = any, TResult = any> {
  id: string;
  workspaceId: string;
  createdBy: string;
  type: JobType;
  status: JobStatus;
  params: TParams;
  result?: TResult;
  error?: string;
  progress: JobProgress;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobQueueAdapter {
  enqueue<P, R>(
    jobData: Omit<BackgroundJob<P, R>, 'id' | 'status' | 'progress' | 'createdAt'>
  ): Promise<BackgroundJob<P, R>>;
  getJob(jobId: string): Promise<BackgroundJob | null>;
  listJobs(workspaceId: string, filter?: { status?: JobStatus; type?: JobType }): Promise<BackgroundJob[]>;
  cancelJob(jobId: string, reason?: string): Promise<boolean>;
  subscribe(jobId: string, callback: (job: BackgroundJob) => void): () => void;
  clearCompletedJobs(workspaceId: string): Promise<void>;
}

export class LocalJobQueue implements JobQueueAdapter {
  private jobs: Map<string, BackgroundJob> = new Map();
  private subscribers: Map<string, Set<(job: BackgroundJob) => void>> = new Map();
  private activeCancellations: Set<string> = new Set();
  private isProcessing = false;

  async enqueue<P, R>(
    jobData: Omit<BackgroundJob<P, R>, 'id' | 'status' | 'progress' | 'createdAt'>
  ): Promise<BackgroundJob<P, R>> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: BackgroundJob<P, R> = {
      ...jobData,
      id,
      status: 'queued',
      progress: { percent: 0, stage: 'Job queued' },
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(id, job as BackgroundJob);
    this.notifySubscribers(job as BackgroundJob);

    // Trigger asynchronous processor loop without blocking caller
    setTimeout(() => this.processNext(), 10);

    return job;
  }

  async getJob(jobId: string): Promise<BackgroundJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async listJobs(
    workspaceId: string,
    filter?: { status?: JobStatus; type?: JobType }
  ): Promise<BackgroundJob[]> {
    const all = Array.from(this.jobs.values()).filter((j) => j.workspaceId === workspaceId);
    return all.filter((j) => {
      if (filter?.status && j.status !== filter.status) return false;
      if (filter?.type && j.type !== filter.type) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async cancelJob(jobId: string, reason = 'Cancelled by user'): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return false;
    }

    this.activeCancellations.add(jobId);

    job.status = 'cancelled';
    job.error = reason;
    job.completedAt = new Date().toISOString();
    job.progress = { percent: 100, stage: `Cancelled: ${reason}` };

    this.jobs.set(jobId, job);
    this.notifySubscribers(job);
    return true;
  }

  subscribe(jobId: string, callback: (job: BackgroundJob) => void): () => void {
    let set = this.subscribers.get(jobId);
    if (!set) {
      set = new Set();
      this.subscribers.set(jobId, set);
    }
    set.add(callback);

    // Initial state trigger if job exists
    const current = this.jobs.get(jobId);
    if (current) {
      callback(current);
    }

    return () => {
      set?.delete(callback);
      if (set && set.size === 0) {
        this.subscribers.delete(jobId);
      }
    };
  }

  async clearCompletedJobs(workspaceId: string): Promise<void> {
    for (const [id, job] of this.jobs.entries()) {
      if (job.workspaceId === workspaceId && (job.status === 'completed' || job.status === 'cancelled')) {
        this.jobs.delete(id);
      }
    }
  }

  private notifySubscribers(job: BackgroundJob) {
    const subs = this.subscribers.get(job.id);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(job);
        } catch (e) {
          console.error('Error in job subscriber callback:', e);
        }
      });
    }
  }

  private updateJobProgress(jobId: string, percent: number, stage: string, details?: { processedRows?: number; totalRows?: number }) {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'cancelled') return;

    job.progress = {
      percent: Math.min(100, Math.max(0, percent)),
      stage,
      ...details,
    };
    this.notifySubscribers(job);
  }

  /**
   * Internal worker loop executing jobs with cooperative yielding
   */
  private async processNext() {
    if (this.isProcessing) return;

    // Find next queued job
    const queuedJob = Array.from(this.jobs.values()).find((j) => j.status === 'queued');
    if (!queuedJob) return;

    this.isProcessing = true;

    try {
      if (this.activeCancellations.has(queuedJob.id)) {
        queuedJob.status = 'cancelled';
        queuedJob.completedAt = new Date().toISOString();
        this.notifySubscribers(queuedJob);
        this.isProcessing = false;
        return;
      }

      queuedJob.status = 'processing';
      queuedJob.startedAt = new Date().toISOString();
      this.updateJobProgress(queuedJob.id, 10, 'Initializing job worker');

      const isCancelled = () => this.activeCancellations.has(queuedJob.id);

      // Execute shared engine logic based on job type
      const result = await this.executeJobPayload(queuedJob, isCancelled);

      if (isCancelled()) {
        queuedJob.status = 'cancelled';
        queuedJob.completedAt = new Date().toISOString();
        queuedJob.error = 'Job cancelled during execution';
        this.notifySubscribers(queuedJob);
      } else {
        queuedJob.status = 'completed';
        queuedJob.completedAt = new Date().toISOString();
        queuedJob.result = result;
        queuedJob.progress = { percent: 100, stage: 'Completed successfully' };
        this.notifySubscribers(queuedJob);
      }
    } catch (err: any) {
      queuedJob.status = 'failed';
      queuedJob.completedAt = new Date().toISOString();
      queuedJob.error = err?.message || 'Unexpected job execution error';
      queuedJob.progress = { percent: 100, stage: `Failed: ${queuedJob.error}` };
      this.notifySubscribers(queuedJob);
    } finally {
      this.activeCancellations.delete(queuedJob.id);
      this.isProcessing = false;
      // Schedule next queued job if any
      setTimeout(() => this.processNext(), 20);
    }
  }

  /**
   * Executes headless data cleaning engine operations
   */
  private async executeJobPayload(job: BackgroundJob, isCancelled: () => boolean): Promise<any> {
    switch (job.type) {
      case 'execute_recipe': {
        const { baseVersion, recipe } = job.params as {
          baseVersion: DatasetVersion;
          recipe: CleaningRecipe;
        };

        this.updateJobProgress(job.id, 25, `Applying recipe: ${recipe.name}`, {
          totalRows: baseVersion.rows.length,
        });

        if (isCancelled()) return null;

        // Shared cleaning engine execution
        const txResult = await executeRecipe(baseVersion, recipe);

        if (!txResult.success) {
          throw new Error(txResult.error || 'Recipe transaction failed invariants');
        }

        this.updateJobProgress(job.id, 80, 'Validating post-clean invariants');

        let postValidation: PostCleanValidationResult | undefined;
        if (txResult.newVersion) {
          postValidation = validatePostClean(baseVersion, txResult.newVersion, txResult.run?.operations);
        }

        this.updateJobProgress(job.id, 95, 'Finalizing results');

        return {
          transaction: txResult,
          postValidation,
        };
      }

      case 'resolve_entities': {
        const { headers, rows, options } = job.params;
        this.updateJobProgress(job.id, 30, 'Analyzing entity clusters & fuzzy duplicates', {
          totalRows: rows.length,
        });

        if (isCancelled()) return null;

        // Execute shared entity resolution engine
        const report: EntityResolutionReport = resolveEntities(headers, rows);

        this.updateJobProgress(job.id, 90, 'Forming explainable matching groups');

        return report;
      }

      case 'validate_dataset': {
        const { headers, rows, baseVersion } = job.params;
        this.updateJobProgress(job.id, 40, 'Checking structural invariants', { totalRows: rows.length });

        const base = baseVersion || {
          versionId: 'v_base_val',
          versionNumber: 0,
          fileName: 'validation_check.csv',
          headers,
          rows,
          timestamp: new Date().toISOString(),
          label: 'Base Validation',
        };
        const validation = validateDatasetInvariants(base, rows, headers);
        return validation;
      }

      default:
        throw new Error(`Unsupported background job type: ${job.type}`);
    }
  }
}

export const jobQueueService = new LocalJobQueue();
