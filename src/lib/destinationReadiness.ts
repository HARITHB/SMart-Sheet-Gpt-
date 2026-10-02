import Papa from 'papaparse';
import type { CleaningStep } from '@/lib/workflows';

export interface DestinationField {
  targetKey: string;
  targetLabel: string;
  description: string;
  required: boolean;
  type: 'email' | 'phone' | 'string' | 'number' | 'date';
  matchPatterns: RegExp[];
}

export interface DestinationPack {
  id: string;
  name: string;
  category: 'CRM' | 'E-commerce' | 'Marketing' | 'Operations';
  badge: string;
  description: string;
  systemName: string;
  fields: DestinationField[];
}

export const DESTINATION_PACKS: DestinationPack[] = [
  {
    id: 'hubspot_crm',
    name: 'HubSpot CRM Contacts',
    category: 'CRM',
    badge: 'HubSpot',
    systemName: 'HubSpot',
    description: 'Prepares lead lists for error-free HubSpot contact imports with validated emails and E.164 phone formats.',
    fields: [
      {
        targetKey: 'email',
        targetLabel: 'Email Address',
        description: 'Primary contact identifier in HubSpot',
        required: true,
        type: 'email',
        matchPatterns: [/(email|mail|contact.*email)/i],
      },
      {
        targetKey: 'firstname',
        targetLabel: 'First Name',
        description: 'Contact given name',
        required: false,
        type: 'string',
        matchPatterns: [/(first.*name|fname|^name$)/i],
      },
      {
        targetKey: 'lastname',
        targetLabel: 'Last Name',
        description: 'Contact family name',
        required: false,
        type: 'string',
        matchPatterns: [/(last.*name|lname|surname)/i],
      },
      {
        targetKey: 'phone',
        targetLabel: 'Phone Number',
        description: 'Direct phone number formatted for click-to-dial',
        required: false,
        type: 'phone',
        matchPatterns: [/(phone|mobile|cell|tel)/i],
      },
      {
        targetKey: 'company',
        targetLabel: 'Company Name',
        description: 'Associated company organization',
        required: false,
        type: 'string',
        matchPatterns: [/(company|organization|org|business)/i],
      },
      {
        targetKey: 'jobtitle',
        targetLabel: 'Job Title',
        description: 'Contact role or designation',
        required: false,
        type: 'string',
        matchPatterns: [/(title|role|position|job)/i],
      },
      {
        targetKey: 'city',
        targetLabel: 'City',
        description: 'Office or residence city',
        required: false,
        type: 'string',
        matchPatterns: [/(city|location|town)/i],
      },
      {
        targetKey: 'lifecyclestage',
        targetLabel: 'Lifecycle Stage',
        description: 'Lead, Subscriber, or Customer status',
        required: false,
        type: 'string',
        matchPatterns: [/(status|stage|lifecycle)/i],
      },
    ],
  },
  {
    id: 'salesforce_crm',
    name: 'Salesforce Lead Import',
    category: 'CRM',
    badge: 'Salesforce',
    systemName: 'Salesforce',
    description: 'Formats and validates lead spreadsheets to meet Salesforce Data Loader schema and required field constraints.',
    fields: [
      {
        targetKey: 'LastName',
        targetLabel: 'Last Name',
        description: 'Required by Salesforce Lead standard object',
        required: true,
        type: 'string',
        matchPatterns: [/(last.*name|lname|surname|^name$)/i],
      },
      {
        targetKey: 'Company',
        targetLabel: 'Company',
        description: 'Required by Salesforce Lead standard object',
        required: true,
        type: 'string',
        matchPatterns: [/(company|organization|account|business)/i],
      },
      {
        targetKey: 'FirstName',
        targetLabel: 'First Name',
        description: 'Lead given name',
        required: false,
        type: 'string',
        matchPatterns: [/(first.*name|fname)/i],
      },
      {
        targetKey: 'Email',
        targetLabel: 'Email',
        description: 'Lead email address',
        required: true,
        type: 'email',
        matchPatterns: [/(email|mail)/i],
      },
      {
        targetKey: 'Phone',
        targetLabel: 'Phone',
        description: 'Lead telephone number',
        required: false,
        type: 'phone',
        matchPatterns: [/(phone|mobile|tel)/i],
      },
      {
        targetKey: 'Status',
        targetLabel: 'Lead Status',
        description: 'Salesforce lead progression stage',
        required: false,
        type: 'string',
        matchPatterns: [/(status|stage)/i],
      },
      {
        targetKey: 'City',
        targetLabel: 'City',
        description: 'Lead city address',
        required: false,
        type: 'string',
        matchPatterns: [/(city|location)/i],
      },
    ],
  },
  {
    id: 'shopify_customers',
    name: 'Shopify Customer & Orders',
    category: 'E-commerce',
    badge: 'Shopify',
    systemName: 'Shopify',
    description: 'Prepares e-commerce customer and transaction lists for seamless Shopify CSV import.',
    fields: [
      {
        targetKey: 'First Name',
        targetLabel: 'First Name',
        description: 'Customer given name',
        required: false,
        type: 'string',
        matchPatterns: [/(first.*name|fname|customer.*name|^name$)/i],
      },
      {
        targetKey: 'Last Name',
        targetLabel: 'Last Name',
        description: 'Customer surname',
        required: false,
        type: 'string',
        matchPatterns: [/(last.*name|lname|surname)/i],
      },
      {
        targetKey: 'Email',
        targetLabel: 'Email',
        description: 'Customer email for account lookup and notifications',
        required: true,
        type: 'email',
        matchPatterns: [/(email|mail)/i],
      },
      {
        targetKey: 'Phone',
        targetLabel: 'Phone',
        description: 'SMS notification and shipping phone number',
        required: false,
        type: 'phone',
        matchPatterns: [/(phone|mobile|tel)/i],
      },
      {
        targetKey: 'Address1',
        targetLabel: 'Address Line 1',
        description: 'Street shipping address',
        required: false,
        type: 'string',
        matchPatterns: [/(address|street|addr)/i],
      },
      {
        targetKey: 'Zip',
        targetLabel: 'Postal / ZIP Code',
        description: '5-digit or postal routing code',
        required: false,
        type: 'string',
        matchPatterns: [/(zip|postal|pincode)/i],
      },
    ],
  },
  {
    id: 'mailchimp_subscribers',
    name: 'Mailchimp Audience Import',
    category: 'Marketing',
    badge: 'Mailchimp',
    systemName: 'Mailchimp',
    description: 'Deduplicates subscribers and validates email addresses for bounce-free Mailchimp campaign launches.',
    fields: [
      {
        targetKey: 'Email Address',
        targetLabel: 'Email Address',
        description: 'Unique subscriber identifier in Mailchimp',
        required: true,
        type: 'email',
        matchPatterns: [/(email|mail)/i],
      },
      {
        targetKey: 'First Name',
        targetLabel: 'First Name',
        description: 'Subscriber given name for merge tags',
        required: false,
        type: 'string',
        matchPatterns: [/(first.*name|fname|^name$)/i],
      },
      {
        targetKey: 'Last Name',
        targetLabel: 'Last Name',
        description: 'Subscriber surname for merge tags',
        required: false,
        type: 'string',
        matchPatterns: [/(last.*name|lname)/i],
      },
      {
        targetKey: 'Phone Number',
        targetLabel: 'Phone Number',
        description: 'SMS contact number',
        required: false,
        type: 'phone',
        matchPatterns: [/(phone|mobile|tel)/i],
      },
    ],
  },
  {
    id: 'general_business',
    name: 'General Business Operations',
    category: 'Operations',
    badge: 'Master Data',
    systemName: 'Operations',
    description: 'Clean, validated master dataset with standardized casing, trimmed text, and resolved duplicates.',
    fields: [
      {
        targetKey: 'ID',
        targetLabel: 'Record ID / Code',
        description: 'Unique record identifier',
        required: false,
        type: 'string',
        matchPatterns: [/(id|code|sku|ref)/i],
      },
      {
        targetKey: 'Name',
        targetLabel: 'Entity Name',
        description: 'Primary record or person name',
        required: true,
        type: 'string',
        matchPatterns: [/(name|title|customer|vendor)/i],
      },
      {
        targetKey: 'Contact',
        targetLabel: 'Contact Info',
        description: 'Email or phone for outreach',
        required: false,
        type: 'string',
        matchPatterns: [/(contact|email|phone)/i],
      },
    ],
  },
];

export interface ReadinessEvaluation {
  destination: DestinationPack;
  readinessScore: number;
  isReady: boolean;
  mappedFieldCount: number;
  totalFieldsCount: number;
  mapping: Record<string, string>; // sourceHeader -> targetKey
  unmappedRequired: DestinationField[];
  blockingIssues: {
    field: string;
    issue: string;
    count: number;
    severity: 'critical' | 'warning';
  }[];
  passedChecks: string[];
  autoFixSteps: CleaningStep[];
}

export function evaluateDestinationReadiness(
  headers: string[],
  rows: Record<string, string>[],
  pack: DestinationPack
): ReadinessEvaluation {
  const mapping: Record<string, string> = {};
  const mappedTargets = new Set<string>();

  // 1. Compute best header match
  for (const src of headers) {
    const trimmed = src.trim();
    let matchedField: DestinationField | null = null;

    for (const field of pack.fields) {
      if (mappedTargets.has(field.targetKey)) continue;

      for (const pattern of field.matchPatterns) {
        if (pattern.test(trimmed)) {
          matchedField = field;
          break;
        }
      }
      if (matchedField) break;
    }

    if (matchedField) {
      mapping[src] = matchedField.targetKey;
      mappedTargets.add(matchedField.targetKey);
    } else {
      mapping[src] = src; // keep unmapped
    }
  }

  // 2. Identify missing required destination fields
  const unmappedRequired: DestinationField[] = [];
  pack.fields.forEach((field) => {
    if (field.required && !mappedTargets.has(field.targetKey)) {
      unmappedRequired.push(field);
    }
  });

  // 3. Scan for data validation blocking issues
  const blockingIssues: {
    field: string;
    issue: string;
    count: number;
    severity: 'critical' | 'warning';
  }[] = [];
  const passedChecks: string[] = [];

  // Check required field presence & completeness
  pack.fields.forEach((field) => {
    const sourceCol = Object.keys(mapping).find((k) => mapping[k] === field.targetKey);

    if (!sourceCol && field.required) {
      blockingIssues.push({
        field: field.targetLabel,
        issue: `Required field "${field.targetLabel}" is not mapped from spreadsheet`,
        count: rows.length,
        severity: 'critical',
      });
      return;
    }

    if (!sourceCol) return;

    // Check empty values in required fields
    if (field.required) {
      let emptyCount = 0;
      rows.forEach((r) => {
        const val = (r[sourceCol] ?? '').trim();
        if (!val || ['null', 'na', 'n/a', '-'].includes(val.toLowerCase())) {
          emptyCount++;
        }
      });
      if (emptyCount > 0) {
        blockingIssues.push({
          field: field.targetLabel,
          issue: `${emptyCount} rows have missing values in required field "${field.targetLabel}"`,
          count: emptyCount,
          severity: 'critical',
        });
      } else {
        passedChecks.push(`All ${rows.length} rows have non-empty ${field.targetLabel}`);
      }
    }

    // Check email syntax
    if (field.type === 'email') {
      let invalidEmails = 0;
      const seen = new Set<string>();
      let duplicates = 0;

      rows.forEach((r) => {
        const val = (r[sourceCol] ?? '').trim();
        if (val) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            invalidEmails++;
          }
          const lower = val.toLowerCase();
          if (seen.has(lower)) {
            duplicates++;
          } else {
            seen.add(lower);
          }
        }
      });

      if (invalidEmails > 0) {
        blockingIssues.push({
          field: field.targetLabel,
          issue: `${invalidEmails} invalid email address syntaxes detected`,
          count: invalidEmails,
          severity: 'critical',
        });
      } else if (sourceCol) {
        passedChecks.push(`Email syntax valid across all rows`);
      }

      if (duplicates > 0) {
        blockingIssues.push({
          field: field.targetLabel,
          issue: `${duplicates} duplicate email addresses found`,
          count: duplicates,
          severity: 'warning',
        });
      } else if (sourceCol) {
        passedChecks.push(`No duplicate email records`);
      }
    }

    // Check phone formatting
    if (field.type === 'phone') {
      let unformattedPhone = 0;
      rows.forEach((r) => {
        const val = (r[sourceCol] ?? '').trim();
        if (val && !/^\+\d{10,14}$|^\(\d{3}\)\s\d{3}-\d{4}$/.test(val)) {
          unformattedPhone++;
        }
      });

      if (unformattedPhone > 0) {
        blockingIssues.push({
          field: field.targetLabel,
          issue: `${unformattedPhone} phone numbers need international or clean standard formatting`,
          count: unformattedPhone,
          severity: 'warning',
        });
      } else if (sourceCol) {
        passedChecks.push(`Phone numbers standardized`);
      }
    }
  });

  // Calculate readiness score (0-100%)
  const criticalCount = blockingIssues.filter((i) => i.severity === 'critical').length;
  const warningCount = blockingIssues.filter((i) => i.severity === 'warning').length;
  const unmappedReqCount = unmappedRequired.length;

  let score = 100;
  score -= unmappedReqCount * 25;
  score -= criticalCount * 15;
  score -= warningCount * 5;
  const readinessScore = Math.max(10, Math.min(100, score));

  // Determine auto-fix steps
  const autoFixSteps: CleaningStep[] = [];
  autoFixSteps.push({
    id: `fix_map_${pack.id}`,
    title: `Apply ${pack.systemName} schema header mapping`,
    action: 'trim',
    enabled: true,
    deterministic: true,
    reason: `Aligns column headers with ${pack.systemName} standard import format`,
    confidence: 'high',
  });

  if (blockingIssues.some((i) => i.field.includes('Email') && i.issue.includes('duplicate'))) {
    autoFixSteps.push({
      id: `fix_dedup_${pack.id}`,
      title: 'Remove duplicate subscriber / lead records',
      action: 'deduplicate',
      enabled: true,
      deterministic: true,
      reason: 'Ensures unique contact entries before CRM synchronization',
      confidence: 'high',
    });
  }

  if (blockingIssues.some((i) => i.field.includes('Phone'))) {
    autoFixSteps.push({
      id: `fix_phone_${pack.id}`,
      title: `Normalize phone numbers for ${pack.systemName}`,
      action: 'normalize_phone',
      enabled: true,
      deterministic: true,
      reason: 'Converts phone numbers to consistent format with area codes',
      confidence: 'high',
    });
  }

  autoFixSteps.push({
    id: `fix_names_${pack.id}`,
    title: 'Standardize contact names to Title Case',
    action: 'titlecase',
    enabled: true,
    deterministic: true,
    reason: 'Ensures professional presentation in CRM and email campaigns',
    confidence: 'high',
  });

  return {
    destination: pack,
    readinessScore,
    isReady: readinessScore >= 90 && criticalCount === 0,
    mappedFieldCount: mappedTargets.size,
    totalFieldsCount: pack.fields.length,
    mapping,
    unmappedRequired,
    blockingIssues,
    passedChecks,
    autoFixSteps,
  };
}

export function exportDestinationReadyCsv(
  fileName: string,
  rows: Record<string, string>[],
  pack: DestinationPack,
  mapping: Record<string, string>
): void {
  // Translate headers to destination target keys
  const exportRows = rows.map((row) => {
    const formatted: Record<string, string> = {};
    Object.keys(row).forEach((col) => {
      const targetKey = mapping[col] || col;
      formatted[targetKey] = row[col] ?? '';
    });
    return formatted;
  });

  const csvString = Papa.unparse(exportRows, {
    quotes: true,
    header: true,
  });

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  link.setAttribute('download', `${baseName}_${pack.id}_ready.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
