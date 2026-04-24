import Decimal from 'decimal.js';

// Configure decimal.js for financial arithmetic
Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});

export { Decimal };

export const MINIMUM_AMOUNT = new Decimal('0.01');

/**
 * Parses a value into a Decimal, rounded to 2 decimal places.
 * @param {string|number} value
 * @returns {Decimal}
 * @throws {Error} if the value is not a valid number
 */
export function parseAmount(value) {
  try {
    const d = new Decimal(value);
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    throw new Error(`Invalid amount: ${value}`);
  }
}

/**
 * Validates that the amount is a positive value >= 0.01.
 * @param {string|number} value
 * @returns {{ valid: boolean, amount: Decimal|null, error: string|null }}
 */
export function validateAmount(value) {
  try {
    const amount = parseAmount(value);

    if (amount.isNaN() || !amount.isFinite()) {
      return { valid: false, amount: null, error: 'Amount must be a valid number' };
    }

    if (amount.lte(0)) {
      return { valid: false, amount: null, error: 'Amount must be greater than zero' };
    }

    if (amount.lt(MINIMUM_AMOUNT)) {
      return { valid: false, amount: null, error: `Amount must be at least ${MINIMUM_AMOUNT.toString()}` };
    }

    return { valid: true, amount, error: null };
  } catch {
    return { valid: false, amount: null, error: `Invalid amount: ${value}` };
  }
}

/**
 * Adds two decimal amounts, returns string with 2 decimal places.
 * @param {string|Decimal} a
 * @param {string|Decimal} b
 * @returns {string}
 */
export function addAmounts(a, b) {
  return new Decimal(a).plus(new Decimal(b)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Subtracts b from a, returns string with 2 decimal places.
 * @param {string|Decimal} a
 * @param {string|Decimal} b
 * @returns {string}
 */
export function subtractAmounts(a, b) {
  return new Decimal(a).minus(new Decimal(b)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Returns true if a >= b.
 * @param {string|Decimal} a
 * @param {string|Decimal} b
 * @returns {boolean}
 */
export function isGreaterOrEqual(a, b) {
  return new Decimal(a).gte(new Decimal(b));
}

/**
 * Format a Decimal or string to 2 decimal places for consistent output.
 * @param {string|Decimal} value
 * @returns {string}
 */
export function formatAmount(value) {
  return new Decimal(value).toFixed(2);
}
