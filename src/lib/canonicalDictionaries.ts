export interface DictionaryEntry {
  canonical: string;
  aliases: string[];
  category: 'city' | 'country' | 'state' | 'company_suffix';
}

export const CANONICAL_CITIES: Record<string, string> = {
  // Indian Cities
  'hyd': 'Hyderabad',
  'hyderabad': 'Hyderabad',
  'hyderabad city': 'Hyderabad',
  'secunderabad': 'Hyderabad',
  'blr': 'Bengaluru',
  'bangalore': 'Bengaluru',
  'bengaluru': 'Bengaluru',
  'bom': 'Mumbai',
  'bombay': 'Mumbai',
  'mumbai': 'Mumbai',
  'del': 'Delhi',
  'delhi': 'Delhi',
  'new delhi': 'Delhi',
  'dilli': 'Delhi',
  'maa': 'Chennai',
  'madras': 'Chennai',
  'chennai': 'Chennai',
  'ccu': 'Kolkata',
  'calcutta': 'Kolkata',
  'kolkata': 'Kolkata',
  'pune': 'Pune',
  'poona': 'Pune',
  'pnq': 'Pune',
  'amd': 'Ahmedabad',
  'ahmedabad': 'Ahmedabad',
  'gurgaon': 'Gurugram',
  'gurugram': 'Gurugram',
  'noida': 'Noida',
  // US & Global Cities
  'nyc': 'New York',
  'new york': 'New York',
  'new york city': 'New York',
  'ny': 'New York',
  'sf': 'San Francisco',
  'san francisco': 'San Francisco',
  'san francisco ca': 'San Francisco',
  'la': 'Los Angeles',
  'los angeles': 'Los Angeles',
  'los angeles ca': 'Los Angeles',
  'chi': 'Chicago',
  'chicago': 'Chicago',
  'chicago il': 'Chicago',
  'atx': 'Austin',
  'austin': 'Austin',
  'austin tx': 'Austin',
  'sea': 'Seattle',
  'seattle': 'Seattle',
  'lon': 'London',
  'london': 'London',
  'sg': 'Singapore',
  'singapore': 'Singapore',
  'dxb': 'Dubai',
  'dubai': 'Dubai',
};

export const CANONICAL_COUNTRIES: Record<string, string> = {
  'us': 'United States',
  'usa': 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  'in': 'India',
  'ind': 'India',
  'india': 'India',
  'bharat': 'India',
  'ca': 'Canada',
  'can': 'Canada',
  'canada': 'Canada',
  'au': 'Australia',
  'aus': 'Australia',
  'australia': 'Australia',
  'de': 'Germany',
  'germany': 'Germany',
  'deutschland': 'Germany',
  'sg': 'Singapore',
  'singapore': 'Singapore',
  'uae': 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
};

export const CANONICAL_STATES: Record<string, string> = {
  // US States
  'ca': 'California',
  'ny': 'New York',
  'tx': 'Texas',
  'fl': 'Florida',
  'il': 'Illinois',
  'wa': 'Washington',
  'ma': 'Massachusetts',
  // Indian States
  'ts': 'Telangana',
  'tg': 'Telangana',
  'telangana': 'Telangana',
  'ap': 'Andhra Pradesh',
  'andhra pradesh': 'Andhra Pradesh',
  'ka': 'Karnataka',
  'karnataka': 'Karnataka',
  'mh': 'Maharashtra',
  'maharashtra': 'Maharashtra',
  'dl': 'Delhi',
  'tn': 'Tamil Nadu',
  'tamil nadu': 'Tamil Nadu',
};

export function normalizeCanonicalValue(
  value: string,
  type: 'city' | 'country' | 'state' | 'company'
): { normalized: string; changed: boolean; reason?: string } {
  if (!value || typeof value !== 'string') return { normalized: value, changed: false };
  const trimmed = value.trim();
  const cleaned = trimmed.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').trim();

  if (type === 'city') {
    if (CANONICAL_CITIES[cleaned]) {
      const canonical = CANONICAL_CITIES[cleaned];
      return {
        normalized: canonical,
        changed: canonical !== trimmed,
        reason: `Standardized city variation "${trimmed}" to canonical "${canonical}"`,
      };
    }
  }

  if (type === 'country') {
    if (CANONICAL_COUNTRIES[cleaned]) {
      const canonical = CANONICAL_COUNTRIES[cleaned];
      return {
        normalized: canonical,
        changed: canonical !== trimmed,
        reason: `Standardized country code/alias "${trimmed}" to canonical "${canonical}"`,
      };
    }
  }

  if (type === 'state') {
    if (CANONICAL_STATES[cleaned]) {
      const canonical = CANONICAL_STATES[cleaned];
      return {
        normalized: canonical,
        changed: canonical !== trimmed,
        reason: `Standardized state abbreviation "${trimmed}" to "${canonical}"`,
      };
    }
  }

  if (type === 'company') {
    // Normalize company suffixes: Pvt Ltd / Private Limited / Inc / LLC
    let formatted = trimmed;
    const suffixMap: [RegExp, string][] = [
      [/\b(pvt\.?\s*ltd\.?|private\s+limited)\b/gi, 'Private Limited'],
      [/\b(inc\.?|incorporated)\b/gi, 'Inc.'],
      [/\b(llc\.?|l\.l\.c\.)\b/gi, 'LLC'],
      [/\b(corp\.?|corporation)\b/gi, 'Corp.'],
    ];

    for (const [pattern, replacement] of suffixMap) {
      if (pattern.test(formatted)) {
        formatted = formatted.replace(pattern, replacement);
        return {
          normalized: formatted,
          changed: formatted !== trimmed,
          reason: `Standardized corporate entity suffix in "${trimmed}"`,
        };
      }
    }
  }

  return { normalized: trimmed, changed: false };
}
