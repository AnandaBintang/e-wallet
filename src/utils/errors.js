/**
 * Custom error classes for the E-Wallet system.
 * Each maps to a specific HTTP status code.
 */

export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds') {
    super(message, 400, 'INSUFFICIENT_FUNDS');
  }
}

export class WalletNotFoundError extends AppError {
  constructor(walletId) {
    super(`Wallet not found: ${walletId}`, 404, 'WALLET_NOT_FOUND');
  }
}

export class WalletSuspendedError extends AppError {
  constructor(walletId) {
    super(`Wallet is suspended: ${walletId}`, 403, 'WALLET_SUSPENDED');
  }
}

export class CurrencyMismatchError extends AppError {
  constructor(fromCurrency, toCurrency) {
    super(
      `Currency mismatch: cannot transfer from ${fromCurrency} to ${toCurrency}`,
      400,
      'CURRENCY_MISMATCH'
    );
  }
}

export class DuplicateWalletError extends AppError {
  constructor(ownerId, currency) {
    super(
      `Wallet already exists for owner ${ownerId} with currency ${currency}`,
      409,
      'DUPLICATE_WALLET'
    );
  }
}
