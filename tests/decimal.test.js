import { describe, it, expect } from '@jest/globals';
import {
  parseAmount,
  validateAmount,
  addAmounts,
  subtractAmounts,
  isGreaterOrEqual,
  formatAmount,
  Decimal,
} from '../src/utils/decimal.js';

describe('Decimal Utilities', () => {
  describe('parseAmount', () => {
    it('should parse a valid integer string', () => {
      const result = parseAmount('100');
      expect(result.toFixed(2)).toBe('100.00');
    });

    it('should parse a valid decimal string', () => {
      const result = parseAmount('12.50');
      expect(result.toFixed(2)).toBe('12.50');
    });

    it('should parse a number input', () => {
      const result = parseAmount(99.99);
      expect(result.toFixed(2)).toBe('99.99');
    });

    it('should round 12.345 to 12.35 (ROUND_HALF_UP)', () => {
      const result = parseAmount('12.345');
      expect(result.toFixed(2)).toBe('12.35');
    });

    it('should round 12.344 to 12.34', () => {
      const result = parseAmount('12.344');
      expect(result.toFixed(2)).toBe('12.34');
    });

    it('should round 0.005 to 0.01 (ROUND_HALF_UP)', () => {
      const result = parseAmount('0.005');
      expect(result.toFixed(2)).toBe('0.01');
    });

    it('should handle large balances (1 billion)', () => {
      const result = parseAmount('1000000000.00');
      expect(result.toFixed(2)).toBe('1000000000.00');
    });

    it('should handle very large balances (100 billion)', () => {
      const result = parseAmount('100000000000.99');
      expect(result.toFixed(2)).toBe('100000000000.99');
    });

    it('should throw on invalid input', () => {
      expect(() => parseAmount('abc')).toThrow('Invalid amount');
    });

    it('should throw on empty string', () => {
      expect(() => parseAmount('')).toThrow('Invalid amount');
    });
  });

  describe('validateAmount', () => {
    it('should accept valid positive amounts', () => {
      const result = validateAmount('100.50');
      expect(result.valid).toBe(true);
      expect(result.amount.toFixed(2)).toBe('100.50');
      expect(result.error).toBeNull();
    });

    it('should accept minimum amount (0.01)', () => {
      const result = validateAmount('0.01');
      expect(result.valid).toBe(true);
    });

    it('should reject zero amount', () => {
      const result = validateAmount('0.00');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject negative amount', () => {
      const result = validateAmount('-10.00');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject amount less than 0.01 after rounding', () => {
      const result = validateAmount('0.001');
      expect(result.valid).toBe(false);
    });

    it('should reject non-numeric string', () => {
      const result = validateAmount('not-a-number');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    it('should accept large amount', () => {
      const result = validateAmount('999999999999.99');
      expect(result.valid).toBe(true);
    });
  });

  describe('addAmounts', () => {
    it('should add two decimal amounts correctly', () => {
      expect(addAmounts('100.50', '200.75')).toBe('301.25');
    });

    it('should add without floating-point errors', () => {
      expect(addAmounts('0.10', '0.20')).toBe('0.30');
    });

    it('should handle large number addition', () => {
      expect(addAmounts('999999999.99', '0.01')).toBe('1000000000.00');
    });
  });

  describe('subtractAmounts', () => {
    it('should subtract two decimal amounts correctly', () => {
      expect(subtractAmounts('500.00', '200.75')).toBe('299.25');
    });

    it('should subtract without floating-point errors', () => {
      expect(subtractAmounts('0.30', '0.10')).toBe('0.20');
    });

    it('should handle subtraction to zero', () => {
      expect(subtractAmounts('100.00', '100.00')).toBe('0.00');
    });
  });

  describe('isGreaterOrEqual', () => {
    it('should return true when a > b', () => {
      expect(isGreaterOrEqual('100.00', '50.00')).toBe(true);
    });

    it('should return true when a === b', () => {
      expect(isGreaterOrEqual('100.00', '100.00')).toBe(true);
    });

    it('should return false when a < b', () => {
      expect(isGreaterOrEqual('50.00', '100.00')).toBe(false);
    });
  });

  describe('formatAmount', () => {
    it('should format to 2 decimal places', () => {
      expect(formatAmount('100')).toBe('100.00');
    });

    it('should preserve 2 decimal places', () => {
      expect(formatAmount('12.50')).toBe('12.50');
    });

    it('should format Decimal objects', () => {
      expect(formatAmount(new Decimal('99.9'))).toBe('99.90');
    });
  });
});
