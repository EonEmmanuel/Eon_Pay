export const DOMAIN_CURRENCY = "XAF" as const;

export type CurrencyCode = typeof DOMAIN_CURRENCY;

/**
 * Money is always represented as a non-negative integer number of ISO minor
 * units. XAF has no fractional minor unit, so 48_167 means 48,167 FCFA.
 */
export interface Money {
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
}

export function money(
  minorUnits: number,
  currency: CurrencyCode = DOMAIN_CURRENCY,
): Money {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new Error("Money must use non-negative safe integer minor units.");
  }

  return Object.freeze({ minorUnits, currency });
}

export function assertMoney(value: Money): void {
  if (value.currency !== DOMAIN_CURRENCY) {
    throw new Error(`Unsupported currency: ${value.currency as string}.`);
  }

  if (!Number.isSafeInteger(value.minorUnits) || value.minorUnits < 0) {
    throw new Error("Money must use non-negative safe integer minor units.");
  }
}

export function assertSameCurrency(values: readonly Money[]): CurrencyCode {
  for (const value of values) {
    assertMoney(value);
  }

  return DOMAIN_CURRENCY;
}

export function sumMoney(values: readonly Money[]): Money {
  const currency = assertSameCurrency(values);
  const total = values.reduce((sum, value) => sum + value.minorUnits, 0);

  if (!Number.isSafeInteger(total)) {
    throw new Error("Money total exceeds the safe integer range.");
  }

  return money(total, currency);
}

export function subtractMoney(minuend: Money, subtrahend: Money): Money {
  assertSameCurrency([minuend, subtrahend]);
  const difference = minuend.minorUnits - subtrahend.minorUnits;

  if (difference < 0) {
    throw new Error("Money subtraction cannot produce a negative amount.");
  }

  return money(difference, minuend.currency);
}

export function isZeroMoney(value: Money): boolean {
  assertMoney(value);
  return value.minorUnits === 0;
}
