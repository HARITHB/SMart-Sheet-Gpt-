/**
 * SaaS Foundation: Shared Cleaning Engine
 * 
 * CORE REQUIREMENT:
 * "Keep the cleaning engine shared between UI and future API/jobs."
 * 
 * This service unifies:
 * - Authorization assertion (RBAC check)
 * - Quota checking & consumption metering
 * - Security payload validation & formula injection sanitization
 * - Transactional execution with invariant protection
 * - Post-clean validation report generation
 * - Audit trail logging
 * - Session recovery checkpointing
 */

import { DatasetVersion, CleaningOperation } from '../core/types';
import { CleaningRecipe, executeRecipe } from '../core/recipes';
import { executeTransactionalRun, TransactionResult } from '../core/transaction';
import { validatePostClean, PostCleanValidationResult } from '../core/postCleanValidator';
import { AuthSession, authService } from './auth';
import { meteringService } from './metering';
import { WorkspaceTier } from './workspace';
import { assertAuthorized, validatePayloadBounds, sanitizeDatasetRows } from './security';
import { persistenceService } from './persistence';
import { sessionRecoveryService } from './sessionRecovery';

export interface ExecuteCleanParams {
  session: AuthSession;
  workspaceTier?: WorkspaceTier;
  datasetId?: string;
  baseVersion: DatasetVersion;
  recipe?: CleaningRecipe;
  operations?: CleaningOperation[];
  transformFn?: (
    candidateRows: any[],
    candidateHeaders: string[],
    signal?: any
  ) => Promise<{ rows: any[]; headers: string[] }> | { rows: any[]; headers: string[] };
  options?: {
    label?: string;
    sanitizeFormulas?: boolean;
    updateSessionCheckpoint?: boolean;
  };
}

export interface SharedCleanResult {
  success: boolean;
  baseVersion: DatasetVersion;
  newVersion?: DatasetVersion;
  transaction: TransactionResult;
  postCleanValidation?: PostCleanValidationResult;
  error?: string;
}

export class SharedCleaningEngine {
  /**
   * Primary entrypoint for both reactive UI executions and background jobs
   */
  async executeClean(params: ExecuteCleanParams): Promise<SharedCleanResult> {
    const { session, baseVersion } = params;
    const tier = params.workspaceTier || 'starter';

    // 1. Enforce Server/Domain Authorization Boundary
    assertAuthorized(session, 'data:clean');

    // 2. Validate Security Bounds on Input Data
    validatePayloadBounds(baseVersion.headers, baseVersion.rows);

    // 3. Centralized Quota Enforcement
    const rowCount = baseVersion.rows.length;
    await meteringService.requireQuota(session.workspaceId, tier, 'rows_processed', rowCount);
    await meteringService.requireQuota(session.workspaceId, tier, 'operations_executed', 1);

    // 4. Transactional Execution
    let txResult: TransactionResult;

    if (params.recipe) {
      txResult = await executeRecipe(baseVersion, params.recipe);
    } else if (params.operations && params.transformFn) {
      txResult = await executeTransactionalRun(
        baseVersion,
        params.operations,
        params.transformFn,
        { label: params.options?.label }
      );
    } else {
      throw new Error('Must provide either a CleaningRecipe or operations with a transform function');
    }

    if (!txResult.success || !txResult.newVersion) {
      return {
        success: false,
        baseVersion,
        transaction: txResult,
        error: txResult.error || 'Cleaning transaction failed invariant validation',
      };
    }

    // 5. Formula Sanitization if enabled
    let finalNewVersion = txResult.newVersion;
    if (params.options?.sanitizeFormulas !== false) {
      const sanitizedRows = sanitizeDatasetRows(finalNewVersion.rows, finalNewVersion.headers);
      finalNewVersion = {
        ...finalNewVersion,
        rows: sanitizedRows,
      };
    }

    // 6. Post-Clean Invariant & Safety Validation
    const ops = params.recipe
      ? txResult.run?.operations || []
      : params.operations || [];
    const postCleanValidation = validatePostClean(baseVersion, finalNewVersion, ops);

    // 7. Record Centralized Metering Consumption
    await meteringService.recordUsage(session.workspaceId, session.principal.id, 'rows_processed', rowCount, {
      datasetName: baseVersion.fileName,
      versionNumber: finalNewVersion.versionNumber,
    });
    await meteringService.recordUsage(session.workspaceId, session.principal.id, 'operations_executed', 1, {
      recipeId: params.recipe?.recipeId,
    });

    // 8. Record Immutable Audit Trail
    await persistenceService.saveAuditLog(session.workspaceId, {
      workspaceId: session.workspaceId,
      datasetId: params.datasetId,
      actorId: session.principal.id,
      actorEmail: session.principal.email,
      actorRole: session.principal.role,
      action: 'DATASET_CLEAN_TRANSACTION',
      details: {
        recipeName: params.recipe?.name || 'Custom Clean',
        rowsProcessed: rowCount,
        changedCellsCount: postCleanValidation.changedCellsCount,
        versionBefore: baseVersion.versionNumber,
        versionAfter: finalNewVersion.versionNumber,
      },
    });

    // 9. Update Session Recovery Checkpoint
    if (params.options?.updateSessionCheckpoint !== false) {
      sessionRecoveryService.scheduleCheckpoint({
        workspaceId: session.workspaceId,
        datasetId: params.datasetId,
        fileName: finalNewVersion.fileName,
        headers: finalNewVersion.headers,
        rows: finalNewVersion.rows,
        currentVersion: finalNewVersion,
        versions: [baseVersion, finalNewVersion],
        hasModifications: true,
        activeTab: 'plan',
      });
    }

    return {
      success: true,
      baseVersion,
      newVersion: finalNewVersion,
      transaction: txResult,
      postCleanValidation,
    };
  }
}

export const sharedCleaningEngine = new SharedCleaningEngine();
