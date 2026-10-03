import {
  STANDARD_RECIPES,
  executeRecipe,
  migrateLegacyWorkflowToRecipe,
} from '../src/lib/core/recipes';
import { createInitialVersion } from '../src/lib/core/transaction';
import type { CleaningWorkflow } from '../src/lib/workflows';

export async function runRecipesTests(): Promise<{
  suite: string;
  passed: number;
  failed: number;
  errors: string[];
}> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${testName}`);
    }
  }

  // 1. Standard Recipes catalog
  assert(STANDARD_RECIPES.length >= 3, 'At least 3 standard recipes available');
  const crmRecipe = STANDARD_RECIPES.find((r) => r.recipeId === 'recipe_crm_lead_cleanup');
  assert(crmRecipe !== undefined, 'Found CRM Lead Cleanup recipe');
  assert(crmRecipe?.steps.length === 5, 'CRM recipe has 5 ordered steps');

  // 2. Execute Recipe against dataset transactionally
  const v0 = createInitialVersion(
    'leads.csv',
    ['id', 'name', 'phone', 'address', 'city'],
    [
      {
        id: 'L-1',
        name: '  john doe  ',
        phone: '1234567890',
        address: '123 Main St, Boston MA 02138',
        city: 'boston',
      },
      {
        id: 'L-2',
        name: 'jane smith',
        phone: '555-0199',
        address: '456 Oak, Hoboken NJ 07030',
        city: 'hoboken',
      },
      // Duplicate row of L-2
      {
        id: 'L-2-dup',
        name: 'jane smith',
        phone: '555-0199',
        address: '456 Oak, Hoboken NJ 07030',
        city: 'hoboken',
      },
    ]
  );

  const recipeResult = await executeRecipe(v0, crmRecipe!);
  assert(recipeResult.success === true, 'Recipe executed successfully');
  assert(recipeResult.newVersion?.versionNumber === 1, 'Committed as version 1');

  const rows = recipeResult.newVersion!.rows;
  assert(rows[0].name === 'John Doe', 'Name title-cased');
  assert(rows[0].phone === '(123) 456-7890', 'Phone standardized');
  assert(rows[0].address === '02138', 'ZIP extracted');
  assert(v0.rows[0].name === '  john doe  ', 'Original v0 remains completely immutable');

  // 3. Migrate legacy workflow to Recipe
  const legacyWorkflow: CleaningWorkflow = {
    id: 'wf_custom_101',
    name: 'Custom Order Scrub',
    description: 'Scrub customer phone numbers and names',
    createdAt: new Date().toISOString(),
    steps: [
      {
        id: 's1',
        title: 'Trim',
        action: 'trim',
        enabled: true,
        deterministic: true,
        reason: 'Trim',
      },
      {
        id: 's2',
        title: 'Title case',
        action: 'titlecase',
        column: 'name',
        enabled: true,
        deterministic: true,
        reason: 'Title case',
      },
    ],
  };

  const migrated = migrateLegacyWorkflowToRecipe(legacyWorkflow);
  assert(migrated.recipeId === 'recipe_wf_custom_101', 'Recipe ID properly generated from workflow ID');
  assert(migrated.name === 'Custom Order Scrub', 'Name preserved');
  assert(migrated.steps.length === 2, 'Steps migrated');
  assert(migrated.steps[0].action === 'trim', 'Step 1 action mapped to trim');

  return { suite: 'P1 Cleaning Recipes & Migration', passed, failed, errors };
}
