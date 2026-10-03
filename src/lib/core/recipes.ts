import type { CleaningOperation, DatasetRow, DatasetVersion } from './types';
import type { CleaningWorkflow, CleaningStep } from '../workflows';
import { executeTransactionalRun, type TransactionResult } from './transaction';
import { STANDARD_RULES, executeQualityRule } from './ruleEngine';
import { deduplicateRows } from '../analyzer';
import { transformColumn } from '../transforms';

export interface RecipeStep {
  order: number;
  stepId: string;
  name: string;
  action:
    | 'trim'
    | 'titlecase'
    | 'normalize_phone'
    | 'extract_zip'
    | 'fill_missing'
    | 'deduplicate'
    | 'normalize_city'
    | 'normalize_country'
    | 'sentiment';
  targetColumns?: string[];
  deterministic: boolean;
  confidence: 'high' | 'medium' | 'review';
}

export interface CleaningRecipe {
  recipeId: string;
  version: number;
  name: string;
  description: string;
  targetDomain: 'crm' | 'ecommerce' | 'marketing' | 'operations' | 'general';
  prerequisites: {
    requiredColumns?: string[];
    minRows?: number;
  };
  steps: RecipeStep[];
  expectedOutcome: string;
  validationRules: string[];
}

export const STANDARD_RECIPES: CleaningRecipe[] = [
  {
    recipeId: 'recipe_crm_lead_cleanup',
    version: 1,
    name: 'CRM Lead & Contact Cleanup',
    description: 'Trims whitespace, capitalizes contact names, normalizes phone numbers, extracts ZIP codes, and removes duplicates.',
    targetDomain: 'crm',
    prerequisites: {
      minRows: 1,
    },
    steps: [
      {
        order: 1,
        stepId: 'step_trim',
        name: 'Trim Whitespace',
        action: 'trim',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 2,
        stepId: 'step_titlecase',
        name: 'Standardize Name Casing',
        action: 'titlecase',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 3,
        stepId: 'step_phone',
        name: 'Standardize Phone Numbers',
        action: 'normalize_phone',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 4,
        stepId: 'step_zip',
        name: 'Extract Postal Codes',
        action: 'extract_zip',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 5,
        stepId: 'step_dedup',
        name: 'Deduplicate Exact Matches',
        action: 'deduplicate',
        deterministic: true,
        confidence: 'high',
      },
    ],
    expectedOutcome: 'Standardized contact records ready for CRM import with valid phone and address syntax.',
    validationRules: ['No duplicate rows', 'Standardized phone numbers', 'Non-empty names'],
  },
  {
    recipeId: 'recipe_ecommerce_standardizer',
    version: 1,
    name: 'E-commerce Order Standardizer',
    description: 'Normalizes order records, trims whitespace, standardizes missing fields, and eliminates duplicate order submissions.',
    targetDomain: 'ecommerce',
    prerequisites: {
      minRows: 1,
    },
    steps: [
      {
        order: 1,
        stepId: 'step_trim',
        name: 'Trim Whitespace',
        action: 'trim',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 2,
        stepId: 'step_fill_missing',
        name: 'Standardize Missing Markers',
        action: 'fill_missing',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 3,
        stepId: 'step_dedup',
        name: 'Remove Duplicate Orders',
        action: 'deduplicate',
        deterministic: true,
        confidence: 'high',
      },
    ],
    expectedOutcome: 'Clean order dataset with explicit missing value indicators and zero duplicate orders.',
    validationRules: ['Zero duplicate order rows', 'Monetary amounts preserved', 'Order IDs untouched'],
  },
  {
    recipeId: 'recipe_master_data_dedup',
    version: 1,
    name: 'Master Data Normalization & Deduplication',
    description: 'Rigorous deduplication across all columns with whitespace collapse and city/country canonical standardization.',
    targetDomain: 'operations',
    prerequisites: {
      minRows: 1,
    },
    steps: [
      {
        order: 1,
        stepId: 'step_trim',
        name: 'Trim & Collapse Whitespace',
        action: 'trim',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 2,
        stepId: 'step_city',
        name: 'Canonical City Normalization',
        action: 'normalize_city',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 3,
        stepId: 'step_country',
        name: 'Canonical Country Normalization',
        action: 'normalize_country',
        deterministic: true,
        confidence: 'high',
      },
      {
        order: 4,
        stepId: 'step_dedup',
        name: 'Remove Duplicate Rows',
        action: 'deduplicate',
        deterministic: true,
        confidence: 'high',
      },
    ],
    expectedOutcome: 'Normalized master dataset with standardized geography and unique records.',
    validationRules: ['Exact duplicates removed', 'Cities standardized'],
  },
];

/**
 * Migrates a legacy localStorage CleaningWorkflow to a structured CleaningRecipe.
 */
export function migrateLegacyWorkflowToRecipe(workflow: CleaningWorkflow): CleaningRecipe {
  return {
    recipeId: `recipe_${workflow.id}`,
    version: 1,
    name: workflow.name,
    description: workflow.description || 'Migrated saved workflow',
    targetDomain: (workflow.targetDomain as any) || 'general',
    prerequisites: {},
    steps: workflow.steps.map((s, idx) => ({
      order: idx + 1,
      stepId: s.id,
      name: s.title,
      action: s.action as any,
      targetColumns: s.columns || (s.column ? [s.column] : undefined),
      deterministic: s.deterministic ?? true,
      confidence: s.confidence || 'high',
    })),
    expectedOutcome: 'Custom workflow transformation applied.',
    validationRules: ['Structure validated by transactional invariant checks'],
  };
}

/**
 * Executes a CleaningRecipe transactionally against a base version.
 */
export async function executeRecipe(
  baseVersion: DatasetVersion,
  recipe: CleaningRecipe
): Promise<TransactionResult> {
  const operations: CleaningOperation[] = recipe.steps.map((s) => ({
    operationId: `op_recipe_${recipe.recipeId}_${s.stepId}`,
    type: s.action as any,
    targetColumns: s.targetColumns || baseVersion.headers,
    reason: s.name,
    source: s.deterministic ? 'deterministic' : 'ai',
    confidence: s.confidence,
    deterministic: s.deterministic,
    reviewRequired: false,
  }));

  return executeTransactionalRun(
    baseVersion,
    operations,
    (candidateRows, candidateHeaders) => {
      let workingRows = candidateRows;

      for (const step of recipe.steps) {
        switch (step.action) {
          case 'trim':
            for (const h of candidateHeaders) {
              workingRows = transformColumn(workingRows, h, 'trim');
            }
            break;
          case 'titlecase':
            const textCols =
              step.targetColumns && step.targetColumns.length > 0
                ? step.targetColumns
                : candidateHeaders.filter((h) => !/(id|date|phone|total|price|zip|code)/i.test(h));
            for (const h of textCols) {
              workingRows = transformColumn(workingRows, h, 'titlecase');
            }
            break;
          case 'normalize_phone':
            const phoneCols =
              step.targetColumns && step.targetColumns.length > 0
                ? step.targetColumns
                : candidateHeaders.filter((h) => /(phone|tel|mobile)/i.test(h));
            for (const h of phoneCols) {
              workingRows = transformColumn(workingRows, h, 'normalize_phone');
            }
            break;
          case 'extract_zip':
            const zipCols =
              step.targetColumns && step.targetColumns.length > 0
                ? step.targetColumns
                : candidateHeaders.filter((h) => /(address|street|zip|addr)/i.test(h));
            for (const h of zipCols) {
              workingRows = transformColumn(workingRows, h, 'extract_zip');
            }
            break;
          case 'normalize_city':
            const cityCols =
              step.targetColumns && step.targetColumns.length > 0
                ? step.targetColumns
                : candidateHeaders.filter((h) => /(city|town|location)/i.test(h));
            for (const h of cityCols) {
              workingRows = transformColumn(workingRows, h, 'normalize_city');
            }
            break;
          case 'normalize_country':
            const countryCols =
              step.targetColumns && step.targetColumns.length > 0
                ? step.targetColumns
                : candidateHeaders.filter((h) => /(country|nation)/i.test(h));
            for (const h of countryCols) {
              workingRows = transformColumn(workingRows, h, 'normalize_country');
            }
            break;
          case 'fill_missing':
            workingRows = workingRows.map((row) => {
              const updated = { ...row };
              for (const h of candidateHeaders) {
                const val = (updated[h] ?? '').trim().toLowerCase();
                if (val === 'null' || val === 'na' || val === 'n/a' || val === '-') {
                  updated[h] = '—';
                }
              }
              return updated;
            });
            break;
          case 'deduplicate':
            workingRows = deduplicateRows(candidateHeaders, workingRows);
            break;
          default:
            break;
        }
      }

      return { rows: workingRows, headers: candidateHeaders };
    },
    { label: `Recipe: ${recipe.name}` }
  );
}
