/**
 * Indian Mobile Phone Utility (Frontend)
 */

export function normalizeIndianPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    const ten = digits.slice(2);
    if (/^[6-9]\d{9}$/.test(ten)) return ten;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    const ten = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(ten)) return ten;
  }

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
