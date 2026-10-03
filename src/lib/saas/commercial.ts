/**
 * SaaS Foundation P2B: Commercial Model, Plans, Entitlements & Billing
 * 
 * AUTHORITATIVE COMMERCIAL MODEL:
 * TidyRow has exactly two plans:
 * 1. Free — $0
 * 2. Pro  — $5/month
 * 
 * Strict Commercial Rules:
 * - There is NO Business subscription.
 * - No INR (₹) pricing; all pricing is in USD.
 * - No old ₹499/₹1,999 or $1,499/$4,999 tiers.
 * - If a real billing provider (e.g. Stripe) is not configured, do NOT fake successful payments.
 *   Clearly mark the external integration dependency and require real provider configuration.
 */

export type PlanId = 'free' | 'pro';

export type FeatureKey =
  | 'basic_cleaning'
  | 'preview_and_export'
  | 'health_report'
  | 'exact_duplicates'
  | 'natural_language_plan'
  | 'destination_readiness'
  | 'advanced_entity_resolution'
  | 'multi_file_merge'
  | 'change_log_audit'
  | 'custom_workflows'
  | 'background_jobs';

export interface PlanLimits {
  maxRowsPerFile: number;
  maxFilesPerMonth: number;
  maxOperationsPerMonth: number;
  maxStorageBytes: number;
  maxCustomWorkflows: number;
  maxTeamMembers: number;
}

export interface PlanModel {
  planId: PlanId;
  name: string;
  priceUsd: number;
  billingInterval: 'month' | 'forever';
  description: string;
  features: readonly FeatureKey[];
  limits: PlanLimits;
  enabled: boolean;
}

/**
 * Authoritative Plan Definitions
 */
export const PLANS: Record<PlanId, PlanModel> = {
  free: {
    planId: 'free',
    name: 'Free',
    priceUsd: 0,
    billingInterval: 'forever',
    description: 'For occasional spreadsheet cleanup and core deterministic transformations.',
    features: [
      'basic_cleaning',
      'preview_and_export',
      'health_report',
      'exact_duplicates',
    ],
    limits: {
      maxRowsPerFile: 10_000,
      maxFilesPerMonth: 15,
      maxOperationsPerMonth: 100,
      maxStorageBytes: 25 * 1024 * 1024, // 25MB
      maxCustomWorkflows: 2,
      maxTeamMembers: 1,
    },
    enabled: true,
  },
  pro: {
    planId: 'pro',
    name: 'Pro',
    priceUsd: 5,
    billingInterval: 'month',
    description: 'For advanced cleaning, natural-language plans, change history, and higher processing capacity.',
    features: [
      'basic_cleaning',
      'preview_and_export',
      'health_report',
      'exact_duplicates',
      'natural_language_plan',
      'destination_readiness',
      'advanced_entity_resolution',
      'multi_file_merge',
      'change_log_audit',
      'custom_workflows',
      'background_jobs',
    ],
    limits: {
      maxRowsPerFile: 100_000,
      maxFilesPerMonth: 500,
      maxOperationsPerMonth: 5_000,
      maxStorageBytes: 1024 * 1024 * 1024, // 1GB
      maxCustomWorkflows: 100,
      maxTeamMembers: 10,
    },
    enabled: true,
  },
};

export const FEATURE_METADATA: Record<FeatureKey, { name: string; description: string; requiredPlan: PlanId }> = {
  basic_cleaning: {
    name: 'Basic Cleaning',
    description: 'Whitespace trimming, case formatting, and standard transformations.',
    requiredPlan: 'free',
  },
  preview_and_export: {
    name: 'Preview & Export',
    description: 'Interactive data grid preview and CSV/XLSX download.',
    requiredPlan: 'free',
  },
  health_report: {
    name: 'Dataset Health Diagnosis',
    description: 'Column type inference, null checks, and quality scoring.',
    requiredPlan: 'free',
  },
  exact_duplicates: {
    name: 'Exact Duplicate Removal',
    description: 'Deduplicate completely identical rows safely.',
    requiredPlan: 'free',
  },
  natural_language_plan: {
    name: 'Natural Language Cleaning Plans',
    description: 'Generate structured, reviewable cleaning steps using natural instructions.',
    requiredPlan: 'pro',
  },
  destination_readiness: {
    name: 'Destination Readiness Packs',
    description: 'Validation against HubSpot, Salesforce, and Shopify schemas.',
    requiredPlan: 'pro',
  },
  advanced_entity_resolution: {
    name: 'Advanced Entity Resolution & Fuzzy Matching',
    description: '5-tier cluster detection with explainable matching reasons.',
    requiredPlan: 'pro',
  },
  multi_file_merge: {
    name: 'Multi-File Merge & Join',
    description: 'Merge secondary spreadsheets with primary keys and conflict resolution.',
    requiredPlan: 'pro',
  },
  change_log_audit: {
    name: 'Change Log Audit Export',
    description: 'Cell-level before/after diff audit export in CSV format.',
    requiredPlan: 'pro',
  },
  custom_workflows: {
    name: 'Save Repeatable Workflows',
    description: 'Save and replay custom multi-step transformation recipes.',
    requiredPlan: 'pro',
  },
  background_jobs: {
    name: 'Asynchronous Background Jobs',
    description: 'Execute long-running processing jobs in the background with live progress.',
    requiredPlan: 'pro',
  },
};

export class EntitlementError extends Error {
  constructor(
    public readonly feature: FeatureKey,
    public readonly currentPlan: PlanId,
    public readonly requiredPlan: PlanId,
    message?: string
  ) {
    super(
      message ||
        `Feature '${FEATURE_METADATA[feature]?.name || feature}' requires the ${PLANS[requiredPlan].name} plan ($${PLANS[requiredPlan].priceUsd}/mo). Current plan: ${PLANS[currentPlan].name}.`
    );
    this.name = 'EntitlementError';
  }
}

export class LimitExceededError extends Error {
  constructor(
    public readonly limitName: keyof PlanLimits,
    public readonly currentUsage: number,
    public readonly maxAllowed: number,
    public readonly currentPlan: PlanId
  ) {
    super(
      `Plan limit exceeded for ${String(limitName)}: ${currentUsage.toLocaleString()} / ${maxAllowed.toLocaleString()}. Upgrade to Pro ($5/month) to increase your capacity.`
    );
    this.name = 'LimitExceededError';
  }
}

/**
 * Entitlement Service
 * Checks feature access and limits based on authoritative plan rules.
 */
export class EntitlementService {
  getPlan(planId: PlanId): PlanModel {
    return PLANS[planId] || PLANS.free;
  }

  hasFeature(planId: PlanId, feature: FeatureKey): boolean {
    const plan = this.getPlan(planId);
    return plan.features.includes(feature);
  }

  requireFeature(planId: PlanId, feature: FeatureKey): void {
    if (!this.hasFeature(planId, feature)) {
      const requiredPlan = FEATURE_METADATA[feature]?.requiredPlan || 'pro';
      throw new EntitlementError(feature, planId, requiredPlan);
    }
  }

  checkRowLimit(planId: PlanId, rowCount: number): { allowed: boolean; maxAllowed: number } {
    const plan = this.getPlan(planId);
    return {
      allowed: rowCount <= plan.limits.maxRowsPerFile,
      maxAllowed: plan.limits.maxRowsPerFile,
    };
  }

  requireRowLimit(planId: PlanId, rowCount: number): void {
    const check = this.checkRowLimit(planId, rowCount);
    if (!check.allowed) {
      throw new LimitExceededError('maxRowsPerFile', rowCount, check.maxAllowed, planId);
    }
  }
}

export const entitlementService = new EntitlementService();

/**
 * Billing State & Provider Boundary
 */
export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export interface BillingState {
  workspaceId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  providerName: 'none' | 'stripe';
  isLiveProvider: boolean;
}

export interface CheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
  requiresIntegration?: boolean;
}

export interface BillingProvider {
  isConfigured(): boolean;
  getBillingState(workspaceId: string): Promise<BillingState>;
  createCheckoutSession(workspaceId: string, planId: PlanId, customerEmail: string): Promise<CheckoutResult>;
  createCustomerPortalSession(workspaceId: string): Promise<{ portalUrl?: string; error?: string }>;
  syncSubscription(workspaceId: string): Promise<BillingState>;
}

/**
 * Unconfigured Billing Provider
 * 
 * STRICT COMPLIANCE:
 * "If a real billing provider is not configured, do not fake successful payments.
 *  Build the provider boundary and clearly mark the integration dependency."
 */
export class UnconfiguredBillingProvider implements BillingProvider {
  private states: Map<string, BillingState> = new Map();
  private readonly storageKey = 'tidyrow_billing_state';

  constructor() {
    this.restoreFromStorage();
  }

  private restoreFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          Object.entries(parsed).forEach(([wsId, s]) => {
            this.states.set(wsId, s as BillingState);
          });
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  private persist() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const obj = Object.fromEntries(this.states.entries());
        window.localStorage.setItem(this.storageKey, JSON.stringify(obj));
      }
    } catch {
      // Ignore
    }
  }

  isConfigured(): boolean {
    // Returns true ONLY if real server credentials exist in the environment
    return false;
  }

  async getBillingState(workspaceId: string): Promise<BillingState> {
    const existing = this.states.get(workspaceId);
    if (existing) return existing;

    const defaultState: BillingState = {
      workspaceId,
      planId: 'free',
      status: 'none',
      providerName: 'none',
      isLiveProvider: false,
    };
    return defaultState;
  }

  async createCheckoutSession(
    workspaceId: string,
    planId: PlanId,
    customerEmail: string
  ): Promise<CheckoutResult> {
    if (planId === 'free') {
      const state: BillingState = {
        workspaceId,
        planId: 'free',
        status: 'none',
        providerName: 'none',
        isLiveProvider: false,
      };
      this.states.set(workspaceId, state);
      this.persist();
      return { success: true };
    }

    // Do NOT fake successful payment
    return {
      success: false,
      requiresIntegration: true,
      error:
        'Live billing provider (Stripe) is not configured in this environment. Integration dependency required: STRIPE_SECRET_KEY & STRIPE_WEBHOOK_SECRET. No fake charges will be created.',
    };
  }

  async createCustomerPortalSession(workspaceId: string): Promise<{ portalUrl?: string; error?: string }> {
    return {
      error: 'Customer portal unavailable: Billing provider is not configured.',
    };
  }

  async syncSubscription(workspaceId: string): Promise<BillingState> {
    return this.getBillingState(workspaceId);
  }

  /**
   * Controlled simulation strictly for developer/test verification
   * clearly labeled as a test mock to allow automated integration tests.
   */
  setTestSubscriptionForTesting(workspaceId: string, planId: PlanId, status: SubscriptionStatus): void {
    const state: BillingState = {
      workspaceId,
      planId,
      status,
      customerId: `cus_test_${Math.random().toString(36).slice(2, 7)}`,
      subscriptionId: `sub_test_${Math.random().toString(36).slice(2, 7)}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      providerName: 'none',
      isLiveProvider: false,
    };
    this.states.set(workspaceId, state);
    this.persist();
  }
}

export const billingService = new UnconfiguredBillingProvider();
