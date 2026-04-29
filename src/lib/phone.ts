import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

const COUNTRY_PRIORITY: CountryCode[] = [
  'BJ', 'CI', 'FR', 'GB', 'SN', 'TG', 'NG', 'CM', 'GH', 'US', 'CA', 'BE', 'CH', 'DE', 'ES', 'IT', 'MA', 'ML', 'BF', 'UG', 'KE', 'ZA', 'LU', 'NL', 'PT', 'MR', 'TN', 'RW', 'CD', 'CG', 'GA', 'GN', 'SL', 'LR', 'GM', 'MZ', 'AO', 'TZ', 'ET'
];

function buildCountryCandidates(preferred?: CountryCode): CountryCode[] {
  const merged = [preferred, ...COUNTRY_PRIORITY, ...(getCountries() as CountryCode[])].filter(Boolean) as CountryCode[];
  return Array.from(new Set(merged));
}

function sanitizeRaw(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function normalizeLeading00(raw: string): string {
  const trimmed = sanitizeRaw(raw);
  return trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
}

function parseWithFallbacks(raw: string, preferredCountry?: CountryCode) {
  const normalized = normalizeLeading00(raw);
  if (!normalized) return null;

  const direct = parsePhoneNumberFromString(normalized);
  if (direct?.isValid()) return direct;

  for (const country of buildCountryCandidates(preferredCountry)) {
    const parsed = parsePhoneNumberFromString(normalized, country);
    if (parsed?.isValid()) return parsed;
  }

  return null;
}

/**
 * Returns a normalized E.164-like string without the leading plus.
 * Example: "+229 01 57 77 63 21" -> "2290157776321"
 */
export function toE164(raw: string, preferredCountry?: CountryCode): string {
  const parsed = parseWithFallbacks(raw, preferredCountry);
  if (parsed?.number) return parsed.number.replace(/^\+/, '');
  return normalizeLeading00(raw).replace(/\D/g, '');
}

/**
 * Returns a human-friendly international format for display.
 * Example: "+229 01 57 77 63 21"
 */
export function formatForDisplay(raw: string, preferredCountry?: CountryCode): string {
  const parsed = parseWithFallbacks(raw, preferredCountry);
  if (parsed?.isValid()) return parsed.formatInternational();
  return raw.trim();
}

/**
 * Generic multi-country validity check.
 */
export function isValidPhoneNumber(raw: string, preferredCountry?: CountryCode): boolean {
  return parseWithFallbacks(raw, preferredCountry)?.isValid() ?? false;
}

// Backwards-compatible exports used by existing components.
export const isValidBeninNumber = isValidPhoneNumber;
