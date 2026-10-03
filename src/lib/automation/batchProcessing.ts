/**
 * TidyRow Batch File Processing Engine
 * Step 6 of Automation & API Integrations Architecture
 * 
 * Supports processing batches of spreadsheets with uniform workflow application,
 * independent per-file invariant assertions, rollback isolation, aggregate progress
 * tracking, and comprehensive batch run summaries.
 */

import { DatasetRow, DatasetVersion } from '../core/types';
import { CleaningRecipe } from '../core/recipes';
import { applicationService, ApplicationCleanResponse } from './applicationService';
import { versionedWorkflowService } from './versionedWorkflows';
import { webhookService } from './webhookService';
import { Principal } from '../saas/auth';

export interface BatchFileInput {
  fileId?: string;
  fileName: string;
  headers: string[];
  rows: DatasetRow[];
}

export interface BatchFileResult {
  fileId: string;
  fileName: string;
  success: boolean;
  rowsBefore: number;
  rowsAfter: number;
  operationsExecuted: number;
  cleanedVersion?: DatasetVersion;
  warnings?: string[];
  error?: string;
  durationMs: number;
}

export interface BatchRunSummary {
  batchId: string;
  workspaceId: string;
  totalFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalRowsBefore: number;
  totalRowsAfter: number;
  totalOperationsExecuted: number;
  totalDuplicatesRemoved: number;
  status: 'completed' | 'partial_failure' | 'failed';
  durationMs: number;
  fileResults: BatchFileResult[];
  createdAt: string;
  completedAt: string;
}

export interface BatchProcessingOptions {
  workspaceId: string;
  principal: Principal;
  files: BatchFileInput[];
  recipe?: CleaningRecipe;
  workflowId?: string;
  workflowVersion?: number;
  failFast?: boolean; // If true, abort remaining files on first failure
  onProgress?: (progress: { currentFile: number; totalFiles: number; percent: number; stage: string }) => void;
}

export class BatchProcessingService {
  private batchRuns: Map<string, BatchRunSummary> = new Map();

  async processBatch(options: BatchProcessingOptions): Promise<BatchRunSummary> {
    const {
      workspaceId,
      principal,
      files,
      recipe,
      workflowId,
      workflowVersion,
      failFast = false,
      onProgress,
    } = options;

    if (!files || files.length === 0) {
      throw new Error('Batch file processing requires at least one input file.');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const startTime = performance.now();
    const createdAt = new Date().toISOString();

    const fileResults: BatchFileResult[] = [];
    let succeededFiles = 0;
    let failedFiles = 0;
    let totalRowsBefore = 0;
    let totalRowsAfter = 0;
    let totalOps = 0;
    let totalDupsRemoved = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = file.fileId || `bf_${i + 1}`;
      const fileStart = performance.now();

      onProgress?.({
        currentFile: i + 1,
        totalFiles: files.length,
        percent: Math.round(((i) / files.length) * 100),
        stage: `Processing file ${i + 1} of ${files.length}: ${file.fileName}`,
      });

      totalRowsBefore += file.rows.length;

      try {
        let cleanRes: ApplicationCleanResponse;

        if (workflowId) {
          cleanRes = await versionedWorkflowService.executeWorkflow({
            workflowId,
            workspaceId,
            versionNumber: workflowVersion,
            principal,
            fileName: file.fileName,
            headers: file.headers,
            rows: file.rows,
          });
        } else if (recipe) {
          cleanRes = await applicationService.cleanDataset({
            workspaceId,
            principal,
            fileName: file.fileName,
            headers: file.headers,
            rows: file.rows,
            recipe,
          });
        } else {
          throw new Error('Batch processing requires either a workflowId or a recipe.');
        }

        const fileDuration = performance.now() - fileStart;

        if (cleanRes.success && cleanRes.version) {
          succeededFiles++;
          const afterCount = cleanRes.version.rows.length;
          totalRowsAfter += afterCount;
          totalOps += cleanRes.operationsExecuted;
          totalDupsRemoved += Math.max(0, file.rows.length - afterCount);

          fileResults.push({
            fileId,
            fileName: file.fileName,
            success: true,
            rowsBefore: file.rows.length,
            rowsAfter: afterCount,
            operationsExecuted: cleanRes.operationsExecuted,
            cleanedVersion: cleanRes.version,
            warnings: cleanRes.warnings,
            durationMs: fileDuration,
          });
        } else {
          failedFiles++;
          totalRowsAfter += file.rows.length; // No change
          fileResults.push({
            fileId,
            fileName: file.fileName,
            success: false,
            rowsBefore: file.rows.length,
            rowsAfter: file.rows.length,
            operationsExecuted: 0,
            error: cleanRes.error || 'Invariant validation failed',
            durationMs: fileDuration,
          });

          if (failFast) {
            break;
          }
        }
      } catch (err: any) {
        failedFiles++;
        totalRowsAfter += file.rows.length;
        fileResults.push({
          fileId,
          fileName: file.fileName,
          success: false,
          rowsBefore: file.rows.length,
          rowsAfter: file.rows.length,
          operationsExecuted: 0,
          error: err?.message || 'Processing error',
          durationMs: performance.now() - fileStart,
        });

        if (failFast) {
          break;
        }
      }
    }

    const durationMs = performance.now() - startTime;
    const completedAt = new Date().toISOString();

    let status: 'completed' | 'partial_failure' | 'failed' = 'completed';
    if (succeededFiles === 0 && failedFiles > 0) {
      status = 'failed';
    } else if (failedFiles > 0) {
      status = 'partial_failure';
    }

    const summary: BatchRunSummary = {
      batchId,
      workspaceId,
      totalFiles: files.length,
      succeededFiles,
      failedFiles,
      totalRowsBefore,
      totalRowsAfter,
      totalOperationsExecuted: totalOps,
      totalDuplicatesRemoved: totalDupsRemoved,
      status,
      durationMs,
      fileResults,
      createdAt,
      completedAt,
    };

    this.batchRuns.set(batchId, summary);

    onProgress?.({
      currentFile: files.length,
      totalFiles: files.length,
      percent: 100,
      stage: `Batch ${status} (${succeededFiles}/${files.length} succeeded)`,
    });

    // Fire webhook event
    await webhookService.dispatchEvent(workspaceId, 'batch.completed', {
      batchId,
      status,
      totalFiles: files.length,
      succeededFiles,
      failedFiles,
      totalRowsProcessed: totalRowsBefore,
      durationMs,
    });

    return summary;
  }

  async getBatchSummary(batchId: string): Promise<BatchRunSummary | null> {
    return this.batchRuns.get(batchId) || null;
  }

  async listBatchRuns(workspaceId: string): Promise<BatchRunSummary[]> {
    return Array.from(this.batchRuns.values())
      .filter((b) => b.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const batchProcessingService = new BatchProcessingService();
