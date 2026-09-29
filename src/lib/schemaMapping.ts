export interface SchemaField {
  key: string;
  label: string;
  description: string;
  patterns: RegExp[];
  required?: boolean;
}

export interface TargetSchema {
  id: string;
  name: string;
  description: string;
  fields: SchemaField[];
}

export const CRM_TARGET_SCHEMA: TargetSchema = {
  id: 'crm_lead',
  name: 'Standard CRM Lead Schema (Salesforce / HubSpot ready)',
  description: 'Maps contact and lead lists into standard CRM naming conventions for seamless import.',
  fields: [
    {
      key: 'first_name',
      label: 'First Name',
      description: 'Contact given name',
      patterns: [/first.*name/i, /^fname$/i, /^first$/i],
    },
    {
      key: 'last_name',
      label: 'Last Name',
      description: 'Contact surname',
      patterns: [/last.*name/i, /^lname$/i, /^surname$/i],
    },
    {
      key: 'full_name',
      label: 'Full Name',
      description: 'Full contact name',
      patterns: [/(full.*name|contact.*name|^name$|^lead.*name$|customer.*name)/i],
    },
    {
      key: 'email',
      label: 'Work Email',
      description: 'Primary email address',
      patterns: [/(work.*email|^email$|mail.*id|e-mail|contact.*email)/i],
      required: true,
    },
    {
      key: 'phone',
      label: 'Phone Number',
      description: 'Direct or mobile phone number',
      patterns: [/(phone|mobile|cell|tel|contact.*number)/i],
    },
    {
      key: 'company',
      label: 'Company Name',
      description: 'Organization or employer',
      patterns: [/(company|organization|org|account.*name|business)/i],
    },
    {
      key: 'title',
      label: 'Job Title',
      description: 'Professional title or role',
      patterns: [/(job.*title|role|position|^title$)/i],
    },
    {
      key: 'city',
      label: 'City',
      description: 'Office or residence city',
      patterns: [/(^city$|location|town)/i],
    },
    {
      key: 'status',
      label: 'Lead Status',
      description: 'Pipeline stage (Qualified, Contacted, New)',
      patterns: [/(lead.*status|^status$|stage)/i],
    },
  ],
};

export const ECOMMERCE_TARGET_SCHEMA: TargetSchema = {
  id: 'ecommerce_order',
  name: 'Standard E-commerce Order Schema (Shopify / ERP ready)',
  description: 'Standardizes order numbers, shipping details, and items.',
  fields: [
    {
      key: 'order_id',
      label: 'Order ID',
      description: 'Unique order identifier',
      patterns: [/(order.*id|^order$|invoice.*no|order_number)/i],
      required: true,
    },
    {
      key: 'customer_name',
      label: 'Customer Name',
      description: 'Purchaser name',
      patterns: [/(customer.*name|^customer$|buyer|purchaser)/i],
    },
    {
      key: 'shipping_address',
      label: 'Shipping Address',
      description: 'Street address for fulfillment',
      patterns: [/(shipping.*addr|street.*addr|^address$)/i],
    },
    {
      key: 'postal_code',
      label: 'Postal / ZIP Code',
      description: 'Delivery postal code',
      patterns: [/(zip|postal|pin.*code)/i],
    },
    {
      key: 'total_amount',
      label: 'Total Amount',
      description: 'Order value or price',
      patterns: [/(order.*total|amount|price|order.*value)/i],
    },
    {
      key: 'order_date',
      label: 'Order Date',
      description: 'Transaction date',
      patterns: [/(order.*date|^date$|created_at)/i],
    },
  ],
};

export function suggestSchemaMapping(
  sourceHeaders: string[],
  targetSchema: TargetSchema
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const mappedTargets = new Set<string>();

  for (const src of sourceHeaders) {
    const trimmed = src.trim();
    let bestMatch: SchemaField | null = null;

    for (const field of targetSchema.fields) {
      if (mappedTargets.has(field.key)) continue;

      for (const pat of field.patterns) {
        if (pat.test(trimmed)) {
          bestMatch = field;
          break;
        }
      }
      if (bestMatch) break;
    }

    if (bestMatch) {
      mapping[src] = bestMatch.key;
      mappedTargets.add(bestMatch.key);
    } else {
      // Keep original header unchanged so no data or column is silently lost!
      mapping[src] = src;
    }
  }

  return mapping;
}

export function applySchemaMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): {
  newHeaders: string[];
  newRows: Record<string, string>[];
} {
  const originalHeaders = Object.keys(mapping);
  const newHeaders = originalHeaders.map((h) => mapping[h] || h);

  const newRows = rows.map((row) => {
    const updated: Record<string, string> = {};
    for (const oldHeader of originalHeaders) {
      const newHeader = mapping[oldHeader] || oldHeader;
      updated[newHeader] = row[oldHeader] ?? '';
    }
    return updated;
  });

  return { newHeaders, newRows };
}
