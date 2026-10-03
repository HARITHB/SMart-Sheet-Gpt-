/**
 * TidyRow Zapier & Make Automation Engine
 * Step 8 of Automation & API Integrations Architecture
 * 
 * Provides:
 * - Inbound webhook triggers for Zapier and Make
 * - Synchronous or asynchronous execution via trusted application service
 * - Callback delivery to Zapier/Make webhooks upon completion
 * - Formal JSON schemas and OpenAPI-compatible tool manifests for Zapier/Make apps
 */

import { DatasetRow, DatasetVersion } from '../core/types';
import { applicationService, ApplicationCleanResponse } from './applicationService';
import { versionedWorkflowService } from './versionedWorkflows';
import { apiKeyService, sha256 } from './apiKeyService';
import { idempotencyService } from './idempotencyService';
import { webhookService } from './webhookService';
import { Principal } from '../saas/auth';
import { STANDARD_RECIPES } from '../core/recipes';

export interface ZapierInboundTriggerPayload {
  apiKey: string;
  workflowId?: string;
  workflowVersion?: number;
  recipeId?: string;
  datasetName?: string;
  headers: string[];
  rows: DatasetRow[];
  callbackUrl?: string; // Zapier/Make webhook callback
  idempotencyKey?: string;
}

export interface ZapierTriggerResponse {
  success: boolean;
  jobId: string;
  status: 'completed' | 'queued' | 'failed';
  rowsBefore: number;
  rowsAfter: number;
  operationsExecuted: number;
  durationMs: number;
  cleanedDataset?: {
    headers: string[];
    rows: Record<string, string>[];
  };
  callbackDispatched?: boolean;
  error?: string;
}

export const ZAPIER_MAKE_ACTIONS_MANIFEST = {
  version: '1.0.0',
  description: 'TidyRow Spreadsheet Cleaning & Data Hygiene Automation Platform',
  triggers: [
    {
      key: 'new_cleaned_dataset',
      name: 'New Cleaned Dataset',
      description: 'Triggers when a dataset cleaning transaction completes successfully in TidyRow.',
      sampleOutput: {
        datasetId: 'v_clean_123',
        fileName: 'leads_clean.csv',
        rowsCount: 450,
        duplicatesRemoved: 12,
        timestamp: '2026-10-03T12:00:00Z',
      },
    },
    {
      key: 'batch_completed',
      name: 'Batch Processing Finished',
      description: 'Triggers when a batch of multiple spreadsheets finishes processing.',
      sampleOutput: {
        batchId: 'batch_123',
        totalFiles: 5,
        succeededFiles: 5,
        totalRowsProcessed: 2500,
      },
    },
  ],
  actions: [
    {
      key: 'clean_with_workflow',
      name: 'Clean Dataset with Workflow',
      description: 'Applies a versioned TidyRow workflow to incoming spreadsheet rows.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'ID of the versioned workflow' },
          workflowVersion: { type: 'number', description: 'Optional specific version to run' },
          datasetName: { type: 'string', description: 'Name of the dataset file' },
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'object' } },
        },
        required: ['headers', 'rows'],
      },
    },
    {
      key: 'validate_spreadsheet_invariants',
      name: 'Validate Spreadsheet Invariants',
      description: 'Asserts data structural safety and health before importing into CRMs.',
      inputSchema: {
        type: 'object',
        properties: {
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'object' } },
        },
        required: ['headers', 'rows'],
      },
    },
  ],
};

export class ZapierMakeAutomationService {
  /**
   * Executes an inbound automation webhook from Zapier or Make.
   * Strictly enforces:
   * 1. API key authentication & scope verification
   * 2. Idempotency guarantees
   * 3. Trusted core engine execution
   * 4. Optional asynchronous callback notification to Zapier/Make
   */
  async handleInboundWebhook(payload: ZapierInboundTriggerPayload): Promise<ZapierTriggerResponse> {
    const startTime = performance.now();

    // 1. Authenticate API Key
    const { apiKey, principal } = await apiKeyService.authenticate(payload.apiKey);
    apiKeyService.assertScope(apiKey, 'workflows:execute');

    const workspaceId = apiKey.workspaceId;
    const fileName = payload.datasetName || 'zapier_dataset.csv';
    const jobId = `job_zap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 2. Check Idempotency if key supplied
    if (payload.idempotencyKey) {
      const lookup = await idempotencyService.acquireOrLookup<ZapierTriggerResponse>(
        workspaceId,
        payload.idempotencyKey,
        '/api/v1/zapier/trigger',
        payload
      );
      if (lookup.isReplay && lookup.cachedResponse) {
        return lookup.cachedResponse.body;
      }
    }

    try {
      let cleanRes: ApplicationCleanResponse;

      // 3. Execute via trusted TidyRow core engine
      if (payload.workflowId) {
        cleanRes = await versionedWorkflowService.executeWorkflow({
          workflowId: payload.workflowId,
          workspaceId,
          versionNumber: payload.workflowVersion,
          principal,
          fileName,
          headers: payload.headers,
          rows: payload.rows,
        });
      } else {
        const recipe =
          (payload.recipeId && STANDARD_RECIPES.find((r) => r.recipeId === payload.recipeId)) ||
          STANDARD_RECIPES[0];
        cleanRes = await applicationService.cleanDataset({
          workspaceId,
          principal,
          fileName,
          headers: payload.headers,
          rows: payload.rows,
          recipe,
        });
      }

      if (!cleanRes.success || !cleanRes.version) {
        const failedResponse: ZapierTriggerResponse = {
          success: false,
          jobId,
          status: 'failed',
          rowsBefore: payload.rows.length,
          rowsAfter: payload.rows.length,
          operationsExecuted: 0,
          durationMs: performance.now() - startTime,
          error: cleanRes.error || 'Clean invariant failed',
        };

        if (payload.idempotencyKey) {
          await idempotencyService.markFailed(workspaceId, payload.idempotencyKey, 422, failedResponse.error!);
        }

        return failedResponse;
      }

      // Prepare response
      let callbackDispatched = false;
      const cleanHeaders = cleanRes.version.headers;
      // Strip internal _tr_id before returning to external automation
      const cleanRows = cleanRes.version.rows.map((r) => {
        const sanitized: Record<string, string> = { ...r };
        delete sanitized._tr_id;
        return sanitized;
      });

      const response: ZapierTriggerResponse = {
        success: true,
        jobId,
        status: 'completed',
        rowsBefore: payload.rows.length,
        rowsAfter: cleanRows.length,
        operationsExecuted: cleanRes.operationsExecuted,
        durationMs: performance.now() - startTime,
        cleanedDataset: {
          headers: cleanHeaders,
          rows: cleanRows,
        },
      };

      // 4. Send callback if Zapier/Make supplied callbackUrl
      if (payload.callbackUrl) {
        callbackDispatched = await this.dispatchCallback(payload.callbackUrl, response);
        response.callbackDispatched = callbackDispatched;
      }

      // Record idempotency
      if (payload.idempotencyKey) {
        await idempotencyService.markCompleted(workspaceId, payload.idempotencyKey, 200, response, jobId);
      }

      return response;
    } catch (err: any) {
      if (payload.idempotencyKey) {
        await idempotencyService.markFailed(workspaceId, payload.idempotencyKey, 500, err?.message);
      }
      throw err;
    }
  }

  private async dispatchCallback(callbackUrl: string, data: any): Promise<boolean> {
    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return res.ok;
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const zapierMakeAutomationService = new ZapierMakeAutomationService();
