/**
 * TidyRow Public API Gateway & Job-Based REST Router
 * Unifies all Automation & API integrations behind a standard HTTP request/response interface.
 */

import { apiKeyService, ApiAuthenticationError, ApiForbiddenError } from './apiKeyService';
import { idempotencyService, IdempotencyConflictError, IdempotencyInFlightError } from './idempotencyService';
import { jobQueueService, BackgroundJob } from '../saas/jobs';
import { applicationService } from './applicationService';
import { versionedWorkflowService } from './versionedWorkflows';
import { batchProcessingService } from './batchProcessing';
import { webhookService } from './webhookService';
import { integrationService } from './integrations';
import { scheduledWorkflowService } from './scheduledWorkflows';

export interface ApiHttpRequest {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface ApiHttpResponse<T = any> {
  statusCode: number;
  headers: Record<string, string>;
  body: T;
}

export class TidyRowApiRouter {
  async handleRequest(req: ApiHttpRequest): Promise<ApiHttpResponse> {
    const rawKey = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || req.headers['x-api-key'];

    // 1. Authenticate Request
    let auth: Awaited<ReturnType<typeof apiKeyService.authenticate>>;
    try {
      auth = await apiKeyService.authenticate(rawKey);
    } catch (err: any) {
      return {
        statusCode: err.statusCode || 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: err.message, type: 'AuthenticationError' },
      };
    }

    const { apiKey, principal } = auth;
    const workspaceId = apiKey.workspaceId;
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    // 2. Handle Idempotency for mutating POST requests
    if (req.method === 'POST' && idempotencyKey) {
      try {
        const lookup = await idempotencyService.acquireOrLookup(
          workspaceId,
          idempotencyKey,
          req.path,
          req.body
        );
        if (lookup.isReplay && lookup.cachedResponse) {
          return {
            statusCode: lookup.cachedResponse.statusCode,
            headers: {
              'Content-Type': 'application/json',
              'X-Cache': 'IDEMPOTENT_HIT',
            },
            body: lookup.cachedResponse.body,
          };
        }
      } catch (err: any) {
        return {
          statusCode: err.statusCode || 422,
          headers: { 'Content-Type': 'application/json' },
          body: { error: err.message, type: err.name },
        };
      }
    }

    // 3. Dispatch to API routes
    try {
      const response = await this.route(req, workspaceId, principal, apiKey);

      // Record successful response in idempotency cache
      if (req.method === 'POST' && idempotencyKey) {
        await idempotencyService.markCompleted(
          workspaceId,
          idempotencyKey,
          response.statusCode,
          response.body,
          (response.body as any)?.jobId || (response.body as any)?.id
        );
      }

      return response;
    } catch (err: any) {
      if (req.method === 'POST' && idempotencyKey) {
        await idempotencyService.markFailed(
          workspaceId,
          idempotencyKey,
          err.statusCode || 500,
          err.message
        );
      }

      return {
        statusCode: err.statusCode || 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: err.message || 'Internal API Error', type: err.name || 'Error' },
      };
    }
  }

  private async route(
    req: ApiHttpRequest,
    workspaceId: string,
    principal: any,
    apiKey: any
  ): Promise<ApiHttpResponse> {
    const { method, path } = req;

    // POST /api/v1/jobs - Submit an asynchronous job
    if (method === 'POST' && path === '/api/v1/jobs') {
      apiKeyService.assertScope(apiKey, 'jobs:create');
      const { type, params } = req.body || {};

      if (!type || !params) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: { error: 'Request body must specify "type" and "params".' },
        };
      }

      const job = await jobQueueService.enqueue({
        workspaceId,
        createdBy: principal.id,
        type,
        params,
      });

      // Fire webhook event: job.queued
      await webhookService.dispatchEvent(workspaceId, 'job.queued', {
        jobId: job.id,
        type: job.type,
        status: job.status,
      });

      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json', Location: `/api/v1/jobs/${job.id}` },
        body: {
          jobId: job.id,
          status: job.status,
          type: job.type,
          createdAt: job.createdAt,
          progress: job.progress,
          links: {
            self: `/api/v1/jobs/${job.id}`,
            cancel: `/api/v1/jobs/${job.id}/cancel`,
          },
        },
      };
    }

    // GET /api/v1/jobs/:id - Query job status & progress
    if (method === 'GET' && path.startsWith('/api/v1/jobs/')) {
      apiKeyService.assertScope(apiKey, 'jobs:read');
      const parts = path.split('/');
      const jobId = parts[4];
      const job = await jobQueueService.getJob(jobId);

      if (!job || job.workspaceId !== workspaceId) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: { error: `Job '${jobId}' not found.` },
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: job,
      };
    }

    // POST /api/v1/jobs/:id/cancel - Cancel running/queued job
    if (method === 'POST' && path.match(/^\/api\/v1\/jobs\/[^/]+\/cancel$/)) {
      apiKeyService.assertScope(apiKey, 'jobs:cancel');
      const jobId = path.split('/')[4];
      const job = await jobQueueService.getJob(jobId);

      if (!job || job.workspaceId !== workspaceId) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: { error: `Job '${jobId}' not found.` },
        };
      }

      const reason = req.body?.reason || 'Cancelled via API request';
      const cancelled = await jobQueueService.cancelJob(jobId, reason);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { jobId, cancelled, status: 'cancelled', reason },
      };
    }

    // GET /api/v1/jobs - List jobs
    if (method === 'GET' && path === '/api/v1/jobs') {
      apiKeyService.assertScope(apiKey, 'jobs:read');
      const jobs = await jobQueueService.listJobs(workspaceId, {
        status: req.query?.status as any,
        type: req.query?.type as any,
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { jobs, count: jobs.length },
      };
    }

    // POST /api/v1/batch - Batch processing
    if (method === 'POST' && path === '/api/v1/batch') {
      apiKeyService.assertScope(apiKey, 'data:clean');
      const { files, workflowId, workflowVersion, recipe, failFast } = req.body || {};

      const summary = await batchProcessingService.processBatch({
        workspaceId,
        principal,
        files,
        workflowId,
        workflowVersion,
        recipe,
        failFast,
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: summary,
      };
    }

    // GET /api/v1/integrations - List integrations
    if (method === 'GET' && path === '/api/v1/integrations') {
      apiKeyService.assertScope(apiKey, 'integrations:read');
      const connections = await integrationService.listAllConnections(workspaceId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { integrations: connections },
      };
    }

    // GET /api/v1/workflows - List workflows
    if (method === 'GET' && path === '/api/v1/workflows') {
      apiKeyService.assertScope(apiKey, 'workflows:read');
      const workflows = await versionedWorkflowService.listWorkflows(workspaceId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { workflows },
      };
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: `Endpoint '${method} ${path}' not found.` },
    };
  }
}

export const apiRouter = new TidyRowApiRouter();
