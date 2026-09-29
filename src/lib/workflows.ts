export interface CleaningStep {
  id: string;
  title: string;
  action:
    | 'trim'
    | 'deduplicate'
    | 'titlecase'
    | 'uppercase'
    | 'lowercase'
    | 'normalize_phone'
    | 'extract_zip'
    | 'extract_email'
    | 'fill_missing'
    | 'sentiment'
    | 'custom_ai';
  column?: string;
  columns?: string[];
  instruction?: string;
  enabled: boolean;
  deterministic: boolean;
  reason: string;
  confidence?: 'high' | 'medium' | 'review';
}

export interface CleaningWorkflow {
  id: string;
  name: string;
  description: string;
  isPreset?: boolean;
  targetDomain?: 'crm' | 'ecommerce' | 'reviews' | 'general';
  steps: CleaningStep[];
  createdAt: string;
}

export const PRESET_WORKFLOWS: CleaningWorkflow[] = [
  {
    id: 'crm_leads',
    name: 'CRM Lead Cleanup',
    description: 'Trims spaces, standardizes contact names to Title Case, formats phone numbers, removes duplicate records, and flags missing emails.',
    isPreset: true,
    targetDomain: 'crm',
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [
      {
        id: 'crm_1',
        title: 'Trim leading/trailing whitespace',
        action: 'trim',
        enabled: true,
        deterministic: true,
        reason: 'Removes accidental trailing tabs and spaces that break CRM search',
        confidence: 'high',
      },
      {
        id: 'crm_2',
        title: 'Standardize names to Title Case',
        action: 'titlecase',
        enabled: true,
        deterministic: true,
        reason: 'Normalizes ALL-CAPS or lowercase names into clean professional casing',
        confidence: 'high',
      },
      {
        id: 'crm_3',
        title: 'Normalize phone numbers',
        action: 'normalize_phone',
        enabled: true,
        deterministic: true,
        reason: 'Formats telephone numbers consistently with clean spacing',
        confidence: 'high',
      },
      {
        id: 'crm_4',
        title: 'Remove exact duplicate rows',
        action: 'deduplicate',
        enabled: true,
        deterministic: true,
        reason: 'Prevents multiple email outreach to the same lead record',
        confidence: 'high',
      },
      {
        id: 'crm_5',
        title: 'Flag missing emails with "N/A"',
        action: 'fill_missing',
        enabled: true,
        deterministic: true,
        reason: 'Provides a clear placeholder instead of ambiguous blank cells',
        confidence: 'high',
      },
    ],
  },
  {
    id: 'ecommerce_addresses',
    name: 'E-commerce Order Standardizer',
    description: 'Deduplicates orders, standardizes customer names, and extracts 5-digit US ZIP codes for delivery dispatch.',
    isPreset: true,
    targetDomain: 'ecommerce',
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [
      {
        id: 'ecom_1',
        title: 'Trim whitespace across all columns',
        action: 'trim',
        enabled: true,
        deterministic: true,
        reason: 'Clean formatting in street address lines',
        confidence: 'high',
      },
      {
        id: 'ecom_2',
        title: 'Standardize customer names to Title Case',
        action: 'titlecase',
        enabled: true,
        deterministic: true,
        reason: 'Polishes packing slip and shipping label names',
        confidence: 'high',
      },
      {
        id: 'ecom_3',
        title: 'Extract 5-digit postal/ZIP codes',
        action: 'extract_zip',
        enabled: true,
        deterministic: true,
        reason: 'Extracts postal codes from unparsed addresses for shipping zone calculation',
        confidence: 'high',
      },
      {
        id: 'ecom_4',
        title: 'Remove duplicate orders',
        action: 'deduplicate',
        enabled: true,
        deterministic: true,
        reason: 'Eliminates accidentally re-submitted duplicate transactions',
        confidence: 'high',
      },
    ],
  },
  {
    id: 'review_sentiment',
    name: 'Customer Review Classifier',
    description: 'Cleans customer feedback text and categorizes sentiment into Positive, Neutral, or Negative using Gemini AI in 100-row batches.',
    isPreset: true,
    targetDomain: 'reviews',
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [
      {
        id: 'rev_1',
        title: 'Trim review text whitespace',
        action: 'trim',
        enabled: true,
        deterministic: true,
        reason: 'Removes extra linebreaks and spaces in text feedback',
        confidence: 'high',
      },
      {
        id: 'rev_2',
        title: 'Deduplicate duplicate review submissions',
        action: 'deduplicate',
        enabled: true,
        deterministic: true,
        reason: 'Removes double submissions from web forms',
        confidence: 'high',
      },
      {
        id: 'rev_3',
        title: 'Categorize sentiment (Positive / Neutral / Negative)',
        action: 'sentiment',
        enabled: true,
        deterministic: false,
        reason: 'Uses Gemini AI in 100-row batches to tag sentiment for reporting',
        confidence: 'high',
      },
    ],
  },
];

const STORAGE_KEY = 'tidyrow_saved_workflows_v1';

export function loadSavedWorkflows(): CleaningWorkflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PRESET_WORKFLOWS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Merge user custom workflows with presets
      const userCustom = parsed.filter((w) => !w.isPreset);
      return [...PRESET_WORKFLOWS, ...userCustom];
    }
  } catch (err) {
    console.warn('Could not load saved workflows from localStorage:', err);
  }
  return PRESET_WORKFLOWS;
}

export function saveUserWorkflow(workflow: Omit<CleaningWorkflow, 'id' | 'createdAt'>): CleaningWorkflow {
  const newWorkflow: CleaningWorkflow = {
    ...workflow,
    id: `wf_${Date.now()}`,
    isPreset: false,
    createdAt: new Date().toISOString(),
  };

  try {
    const all = loadSavedWorkflows();
    const updated = [...all.filter((w) => !w.isPreset), newWorkflow];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Could not save workflow to localStorage:', err);
  }

  return newWorkflow;
}

export function deleteUserWorkflow(id: string): void {
  try {
    const all = loadSavedWorkflows();
    const updated = all.filter((w) => !w.isPreset && w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Could not delete workflow from localStorage:', err);
  }
}
