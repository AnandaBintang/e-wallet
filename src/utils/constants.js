/**
 * Application constants — enums, supported currencies, and configuration values.
 */

export const WALLET_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});

export const LEDGER_TYPE = Object.freeze({
  TOPUP: 'TOPUP',
  PAYMENT: 'PAYMENT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
});

/**
 * Subset of ISO 4217 currency codes.
 * Extend this list as needed.
 */
export const SUPPORTED_CURRENCIES = Object.freeze([
  'USD', 'EUR', 'GBP', 'JPY', 'IDR', 'SGD', 'AUD', 'CAD', 'CHF', 'CNY',
  'HKD', 'KRW', 'MYR', 'NZD', 'PHP', 'THB', 'TWD', 'VND', 'INR', 'BRL',
]);
