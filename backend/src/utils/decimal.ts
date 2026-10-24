import { Decimal } from 'decimal.js';

// Configure Decimal for monetary operations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

export function formatMoney(value: Decimal.Value | null | undefined): number {
  return parseFloat(toDecimal(value).toFixed(2));
}

export function formatWeight(value: Decimal.Value | null | undefined): number {
  return parseFloat(toDecimal(value).toFixed(3));
}

export function multiply(a: Decimal.Value, b: Decimal.Value): Decimal {
  return toDecimal(a).times(toDecimal(b));
}

export function add(...values: (Decimal.Value | null | undefined)[]): Decimal {
  return values.reduce<Decimal>((sum, val) => sum.plus(toDecimal(val)), new Decimal(0));
}

export function subtract(a: Decimal.Value, b: Decimal.Value): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function divide(a: Decimal.Value, b: Decimal.Value): Decimal {
  const decB = toDecimal(b);
  if (decB.isZero()) {
    return new Decimal(0);
  }
  return toDecimal(a).dividedBy(decB);
}

export { Decimal };
