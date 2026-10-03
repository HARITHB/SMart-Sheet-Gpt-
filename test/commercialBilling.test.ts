import {
  PLANS,
  PlanId,
  FeatureKey,
  entitlementService,
  EntitlementError,
  LimitExceededError,
  UnconfiguredBillingProvider,
  billingService,
} from '../src/lib/saas/commercial';

export async function runCommercialBillingTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${msg}`);
    }
  }

  console.log('\n--- Running P2B Commercial & Billing Test Suite ---');

  // ==========================================
  // 1. Two-Plan Commercial Model
  // ==========================================
  console.log('Testing Two-Plan Commercial Model...');
  const planKeys = Object.keys(PLANS);
  assert(planKeys.length === 2, `Exactly two plans exist (found ${planKeys.length}: ${planKeys.join(', ')})`);
  assert(planKeys.includes('free') && planKeys.includes('pro'), 'Plans are strictly "free" and "pro"');

  // Verify NO Business plan exists
  assert((PLANS as any).business === undefined, 'No Business plan exists in plan models');
  assert((PLANS as any).enterprise === undefined, 'No Enterprise plan exists in commercial models');

  // Verify USD Pricing
  assert(PLANS.free.priceUsd === 0, 'Free plan is $0');
  assert(PLANS.free.billingInterval === 'forever', 'Free plan interval is forever');
  assert(PLANS.pro.priceUsd === 5, 'Pro plan is exactly $5/month');
  assert(PLANS.pro.billingInterval === 'month', 'Pro plan billing interval is month');

  // ==========================================
  // 2. Feature Entitlements & Access Controls
  // ==========================================
  console.log('Testing Feature Entitlements & Access Controls...');

  // Free plan entitlements
  assert(entitlementService.hasFeature('free', 'basic_cleaning') === true, 'Free plan has basic_cleaning');
  assert(entitlementService.hasFeature('free', 'preview_and_export') === true, 'Free plan has preview_and_export');
  assert(entitlementService.hasFeature('free', 'health_report') === true, 'Free plan has health_report');
  assert(entitlementService.hasFeature('free', 'exact_duplicates') === true, 'Free plan has exact_duplicates');

  // Free plan gates advanced features
  assert(entitlementService.hasFeature('free', 'natural_language_plan') === false, 'Free plan gates natural_language_plan');
  assert(entitlementService.hasFeature('free', 'destination_readiness') === false, 'Free plan gates destination_readiness');
  assert(entitlementService.hasFeature('free', 'advanced_entity_resolution') === false, 'Free plan gates advanced_entity_resolution');
  assert(entitlementService.hasFeature('free', 'multi_file_merge') === false, 'Free plan gates multi_file_merge');
  assert(entitlementService.hasFeature('free', 'change_log_audit') === false, 'Free plan gates change_log_audit');

  // Pro plan unlocks all features
  assert(entitlementService.hasFeature('pro', 'natural_language_plan') === true, 'Pro plan unlocks natural_language_plan');
  assert(entitlementService.hasFeature('pro', 'destination_readiness') === true, 'Pro plan unlocks destination_readiness');
  assert(entitlementService.hasFeature('pro', 'advanced_entity_resolution') === true, 'Pro plan unlocks advanced_entity_resolution');
  assert(entitlementService.hasFeature('pro', 'multi_file_merge') === true, 'Pro plan unlocks multi_file_merge');
  assert(entitlementService.hasFeature('pro', 'change_log_audit') === true, 'Pro plan unlocks change_log_audit');

  // Entitlement Error throwing
  let entitlementBlocked = false;
  try {
    entitlementService.requireFeature('free', 'destination_readiness');
  } catch (err) {
    if (err instanceof EntitlementError) entitlementBlocked = true;
  }
  assert(entitlementBlocked, 'requireFeature on gated feature throws EntitlementError with upgrade instructions');

  // ==========================================
  // 3. Usage Limits Enforcement
  // ==========================================
  console.log('Testing Usage Limits Enforcement...');

  // Free row limits: 10,000 max
  assert(entitlementService.checkRowLimit('free', 5000).allowed === true, '5,000 rows allowed on Free plan');
  assert(entitlementService.checkRowLimit('free', 10000).allowed === true, '10,000 rows allowed on Free plan');
  assert(entitlementService.checkRowLimit('free', 10001).allowed === false, '10,001 rows blocked on Free plan');

  let limitBlocked = false;
  try {
    entitlementService.requireRowLimit('free', 15000);
  } catch (err) {
    if (err instanceof LimitExceededError) limitBlocked = true;
  }
  assert(limitBlocked, 'requireRowLimit on 15k rows throws LimitExceededError for Free plan');

  // Pro row limits: 100,000 max
  assert(entitlementService.checkRowLimit('pro', 50000).allowed === true, '50,000 rows allowed on Pro plan');
  assert(entitlementService.checkRowLimit('pro', 100000).allowed === true, '100,000 rows allowed on Pro plan');
  assert(entitlementService.checkRowLimit('pro', 100001).allowed === false, '100,001 rows blocked on Pro plan');

  // ==========================================
  // 4. Billing State & Provider Boundary
  // ==========================================
  console.log('Testing Billing State & Provider Boundary...');
  const provider = new UnconfiguredBillingProvider();

  // Crucial requirement: do not fake configured state
  assert(provider.isConfigured() === false, 'Billing provider isConfigured() correctly returns false when not integrated');

  const initialBilling = await provider.getBillingState('ws_test_commercial');
  assert(initialBilling.planId === 'free', 'Default billing plan is Free');
  assert(initialBilling.status === 'none', 'Default subscription status is none');
  assert(initialBilling.isLiveProvider === false, 'Billing state is not marked as live provider');

  // Crucial requirement: do not fake payment
  const checkoutProResult = await provider.createCheckoutSession('ws_test_commercial', 'pro', 'user@example.com');
  assert(checkoutProResult.success === false, 'Pro checkout does NOT claim success without real billing provider');
  assert(checkoutProResult.requiresIntegration === true, 'Checkout result marks integration dependency');
  assert(Boolean(checkoutProResult.error?.includes('STRIPE')), 'Checkout error message explains Stripe secret key dependency');

  // Test environment simulation
  provider.setTestSubscriptionForTesting('ws_test_commercial', 'pro', 'active');
  const testSub = await provider.getBillingState('ws_test_commercial');
  assert(testSub.planId === 'pro', 'Controlled test subscription state can be previewed for testing');
  assert(testSub.isLiveProvider === false, 'Test subscription is never flagged as live provider');

  console.log(`\n====================================================`);
  console.log(`P2B Commercial & Billing: ${passed} passed, ${failed} failed`);
  console.log(`====================================================\n`);

  return { passed, failed };
}

// Auto-run if executed directly via tsx
if (typeof process !== 'undefined' && process.argv[1]?.includes('commercialBilling.test.ts')) {
  runCommercialBillingTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
