/**
 * Indian Mobile Phone Utility
 * Validates and normalizes Indian 10-digit mobile phone numbers.
 * Supports:
 *   "9876543210"        -> "9876543210"
 *   "+91 98765 43210"   -> "9876543210"
 *   "09876543210"       -> "9876543210"
 *   "+91-7989856610"    -> "7989856610"
 */

export function normalizeIndianPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  // Strip all non-digit characters
  const digits = String(input).replace(/\D/g, '');

  // 12 digits starting with country code 91 (e.g. 919876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    const ten = digits.slice(2);
    if (/^[6-9]\d{9}$/.test(ten)) {
      return ten;
    }
  }

  // 11 digits starting with trunk prefix 0 (e.g. 09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    const ten = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(ten)) {
      return ten;
    }
  }

  // Exactly 10 digits starting with 6, 7, 8, or 9
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  return null;
}

export function formatIndianPhone(normalized: string | undefined | null): string {
  if (!normalized) return '';
  const clean = normalizeIndianPhone(normalized);
  if (!clean) return String(normalized);
  return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
}

export function isValidPin(pin: string | undefined | null): boolean {
  if (!pin) return false;
  return /^\d{4}$/.test(String(pin).trim());
}
