/**
 * TidyRow Application-Service Boundary
 * Step 1 of Automation & API Integrations Architecture
 * 
 * CORE REQUIREMENT:
 * "All external automation must use the same trusted TidyRow core engine."
 * 
 * This service forms the authoritative boundary between presentation (UI, REST API,
 * CLI, Webhooks, Integrations, Scheduled Workers) and the headless TidyRow domain logic.
 * No external API, background worker, or automation flow ever mutates data or executes
 * transformations without going through this boundary.
 */

import { DatasetRow, DatasetVersion, CleaningOperation, ValidationResult } from '../core/types';
import { executeTransactionalRun, TransactionResult } from '../core/transaction';
import { executeRecipe, CleaningRecipe } from '../core/recipes';
import { validateDatasetInvariants } from '../core/invariants';
import { validatePostClean, PostCleanValidationResult } from '../core/postCleanValidator';
import { resolveEntities, EntityResolutionReport } from '../core/entityResolution';
import { sanitizeDatasetRows } from '../saas/security';
import { authService, Principal } from '../saas/auth';
import { workspaceService } from '../saas/workspace';
import { meteringService } from '../saas/metering';
import { entitlementService, PlanId } from '../saas/commercial';

export interface ApplicationCleanRequest {
  workspaceId: string;
  principal: Principal;
  fileName: string;
  headers: string[];
  rows: DatasetRow[];
  operations?: CleaningOperation[];
  transformFn?: (
    rows: DatasetRow[],
    headers: string[],
    signal?: { isCancelled?: () => boolean; onProgress?: (completed: number, total: number) => void }
  ) => Promise<{ rows: DatasetRow[]; headers: string[] }> | { rows: DatasetRow[]; headers: string[] };
  recipe?: CleaningRecipe;
  workflowId?: string;
  workflowVersion?: number;
  skipSanitization?: boolean;
}

export interface ApplicationCleanResponse {
  success: boolean;
  version: DatasetVersion;
  transaction: TransactionResult;
  invariantValidation: ValidationResult;
  postValidation?: PostCleanValidationResult;
  rowsProcessed: number;
  operationsExecuted: number;
  durationMs: number;
  warnings?: string[];
  error?: string;
}

export interface ApplicationValidationRequest {
  workspaceId: string;
  principal: Principal;
  headers: string[];
  rows: DatasetRow[];
}

export class TidyRowApplicationService {
  /**
   * Main entrypoint for data cleaning transactions across UI, API, Jobs, and Automations.
   * Strictly enforces:
   * 1. RBAC authorization (requires 'data:clean' or 'data:write')
   * 2. Commercial tier limits (max rows per file)
   * 3. Formula injection sanitization (escapes dangerous spreadsheet prefixes)
   * 4. Trusted core transaction engine execution with rollback safety
   * 5. Invariant validation & post-clean verification
   * 6. Usage metering telemetry
   */
  async cleanDataset(request: ApplicationCleanRequest): Promise<ApplicationCleanResponse> {
    const startTime = performance.now();

    // 1. Authorization check
    authService.assertPrincipalPermission(request.principal, 'data:clean');

    // 2. Entitlement & Usage limit check
    const ws = await workspaceService.getWorkspace(request.workspaceId);
    const planId: PlanId = ws?.tier === 'pro' ? 'pro' : 'free';
    entitlementService.requireRowLimit(planId, request.rows.length);

    // 3. Formula sanitization baseline
    const safeRows = request.skipSanitization
      ? request.rows
      : sanitizeDatasetRows(request.rows, request.headers);

    // Prepare initial base version
    const baseVersion: DatasetVersion = {
      versionId: `v_base_${Date.now()}`,
      versionNumber: 0,
      fileName: request.fileName,
      headers: [...request.headers],
      rows: safeRows.map((r, i) => ({
        ...r,
        _tr_id: r._tr_id || `row_${Date.now()}_${i}`,
      })),
      timestamp: new Date().toISOString(),
      label: 'Pre-Clean Application Base',
    };

    // 4. Invariant check on input dataset
    const baseInvariant = validateDatasetInvariants(baseVersion, baseVersion.rows, baseVersion.headers);
    if (!baseInvariant.valid) {
      const err = `Input dataset invariant violation: ${baseInvariant.errors.join('; ')}`;
      return {
        success: false,
        version: baseVersion,
        transaction: {
          success: false,
          changeRecords: [],
          structuralChanges: [],
          validation: baseInvariant,
          error: err,
        },
        invariantValidation: baseInvariant,
        rowsProcessed: request.rows.length,
        operationsExecuted: 0,
        durationMs: performance.now() - startTime,
        error: err,
      };
    }

    // 5. Execute via shared transactional core
    let txResult: TransactionResult;
    if (request.recipe) {
      txResult = await executeRecipe(baseVersion, request.recipe);
    } else if (request.operations && request.transformFn) {
      txResult = await executeTransactionalRun(
        baseVersion,
        request.operations,
        request.transformFn,
        {
          label: `Application Service Clean [${request.operations.map((o) => o.operationId).join(', ')}]`,
        }
      );
    } else {
      throw new Error('Application clean request must specify either a valid recipe or operations with transformFn.');
    }

    if (!txResult.success || !txResult.newVersion) {
      return {
        success: false,
        version: baseVersion,
        transaction: txResult,
        invariantValidation: baseInvariant,
        rowsProcessed: request.rows.length,
        operationsExecuted: 0,
        durationMs: performance.now() - startTime,
        error: txResult.error || 'Transaction rolled back by core safety engine.',
      };
    }

    // 6. Post-Clean Verification
    const postValidation = validatePostClean(
      baseVersion,
      txResult.newVersion,
      txResult.run?.operations
    );

    // 7. Verify post-invariants
    const postInvariant = validateDatasetInvariants(
      baseVersion,
      txResult.newVersion.rows,
      txResult.newVersion.headers,
      txResult.run?.operations
    );

    // 8. Record usage metering
    const opsCount = txResult.run?.operations.length || (request.recipe?.steps.length ?? 1);
    await meteringService.recordUsage(request.workspaceId, request.principal.id, 'rows_processed', request.rows.length);
    await meteringService.recordUsage(request.workspaceId, request.principal.id, 'operations_executed', opsCount);

    const durationMs = performance.now() - startTime;

    return {
      success: true,
      version: txResult.newVersion,
      transaction: txResult,
      invariantValidation: postInvariant,
      postValidation,
      rowsProcessed: request.rows.length,
      operationsExecuted: opsCount,
      durationMs,
      warnings: postValidation.warnings,
    };
  }

  /**
   * Validates dataset invariants without executing mutations.
   */
  async validateDataset(request: ApplicationValidationRequest): Promise<ValidationResult> {
    authService.assertPrincipalPermission(request.principal, 'data:view');

    const baseVersion: DatasetVersion = {
      versionId: 'v_val_check',
      versionNumber: 0,
      fileName: 'validate.csv',
      headers: request.headers,
      rows: request.rows,
      timestamp: new Date().toISOString(),
      label: 'Validation Base',
    };

    return validateDatasetInvariants(baseVersion, request.rows, request.headers);
  }

  /**
   * Entity resolution clustering execution through shared core engine.
   */
  async resolveEntities(
    workspaceId: string,
    principal: Principal,
    headers: string[],
    rows: DatasetRow[]
  ): Promise<EntityResolutionReport> {
    authService.assertPrincipalPermission(principal, 'data:view');
    const ws = await workspaceService.getWorkspace(workspaceId);
    const planId: PlanId = ws?.tier === 'pro' ? 'pro' : 'free';
    entitlementService.requireFeature(planId, 'advanced_entity_resolution');

    const report = resolveEntities(headers, rows);
    await meteringService.recordUsage(workspaceId, principal.id, 'rows_processed', rows.length);
    await meteringService.recordUsage(workspaceId, principal.id, 'operations_executed', 1);
    return report;
  }
}

export const applicationService = new TidyRowApplicationService();
