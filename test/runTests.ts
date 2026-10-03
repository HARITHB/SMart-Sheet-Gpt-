import { runInvariantsTests } from './invariants.test';
import { runTransactionTests } from './transactions.test';
import { runSchemaMappingTests } from './schemaMapping.test';
import { runChangeLogTests } from './changelog.test';
import { runTransformsTests } from './transforms.test';
import { runPostCleanValidatorTests } from './postCleanValidator.test';
import { runExportValidatorTests } from './exportValidator.test';
import { runEntityResolutionTests } from './entityResolution.test';
import { runRuleEngineTests } from './ruleEngine.test';
import { runRecipesTests } from './recipes.test';
import { runDatasetMergeHardeningTests } from './datasetMergeHardening.test';
import { runVersionRestoreTests } from './versionRestore.test';
import { runLargeFileSimulationTests } from './largeFileSimulation.test';
import { runSaasFoundationTests } from './saasFoundation.test';
import { runCommercialBillingTests } from './commercialBilling.test';
import { runAutomationIntegrationsTests } from './automationApiIntegrations.test';

async function main() {
  console.log('====================================================');
  console.log('  TidyRow P0 + P1 + P2 Automated Verification Suite');
  console.log('====================================================\n');

  const results = [];

  // P0 Core Integrity Suites
  results.push(runInvariantsTests());
  results.push(await runTransactionTests());
  results.push(runSchemaMappingTests());
  results.push(runChangeLogTests());
  results.push(runTransformsTests());

  // P1 Product Hardening Suites
  results.push(await runPostCleanValidatorTests());
  results.push(runExportValidatorTests());
  results.push(runEntityResolutionTests());
  results.push(runRuleEngineTests());
  results.push(await runRecipesTests());
  results.push(runDatasetMergeHardeningTests());
  results.push(await runVersionRestoreTests());
  results.push(await runLargeFileSimulationTests());

  // P2A SaaS Foundation Suite
  const saasRes = await runSaasFoundationTests();
  results.push({
    suite: 'P2A SaaS Foundation & Architecture',
    passed: saasRes.passed,
    failed: saasRes.failed,
    errors: [],
  });

  // P2B Commercial & Billing Suite
  const commercialRes = await runCommercialBillingTests();
  results.push({
    suite: 'P2B Commercial Model, Entitlements & Billing',
    passed: commercialRes.passed,
    failed: commercialRes.failed,
    errors: [],
  });

  // P2C Automation, API & Integrations Suite
  const automationRes = await runAutomationIntegrationsTests();
  results.push({
    suite: 'P2C Automation, API & Integrations',
    passed: automationRes.passed,
    failed: automationRes.failed,
    errors: [],
  });

  let totalPassed = 0;
  let totalFailed = 0;
  const allErrors: string[] = [];

  for (const res of results) {
    totalPassed += res.passed;
    totalFailed += res.failed;
    const icon = res.failed === 0 ? '✓' : '✗';
    console.log(`${icon} [SUITE] ${res.suite}: ${res.passed} passed, ${res.failed} failed`);
    if (res.errors.length > 0) {
      res.errors.forEach((e) => console.error(`   ❌ ${e}`));
      allErrors.push(...res.errors);
    }
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log('====================================================');

  if (totalFailed > 0) {
    console.error(`\n❌ Verification Failed with ${totalFailed} errors.`);
    process.exit(1);
  } else {
    console.log('\n✅ All P0 & P1 Data Safety, Trust & Hardening Tests PASSED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
