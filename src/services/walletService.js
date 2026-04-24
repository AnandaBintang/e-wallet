import WalletModel from '../models/wallet.js';
import LedgerModel from '../models/ledger.js';
import { validateAmount, addAmounts, subtractAmounts, isGreaterOrEqual, formatAmount } from '../utils/decimal.js';
import { WALLET_STATUS, LEDGER_TYPE, SUPPORTED_CURRENCIES } from '../utils/constants.js';
import {
  ValidationError,
  InsufficientFundsError,
  WalletNotFoundError,
  WalletSuspendedError,
  CurrencyMismatchError,
  DuplicateWalletError,
} from '../utils/errors.js';

/**
 * Wallet service — all business logic for wallet operations.
 * Mutating operations run inside Knex transactions with row-level locking.
 */
export class WalletService {
  /** @param {import('knex').Knex} knex */
  constructor(knex) {
    this.knex = knex;
  }

  /**
   * Create a new wallet for a user in a specific currency.
   * @param {string} ownerId
   * @param {string} currency
   * @returns {Promise<object>}
   */
  async createWallet(ownerId, currency) {
    if (!ownerId || typeof ownerId !== 'string' || ownerId.trim() === '') {
      throw new ValidationError('owner_id is required');
    }

    const normalizedCurrency = currency?.toUpperCase();
    if (!normalizedCurrency || !SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
      throw new ValidationError(`Unsupported currency: ${currency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    const existing = await WalletModel.findByOwnerAndCurrency(this.knex, ownerId, normalizedCurrency);
    if (existing) throw new DuplicateWalletError(ownerId, normalizedCurrency);

    const wallet = await WalletModel.create(this.knex, {
      wallet_id: crypto.randomUUID(),
      owner_id: ownerId,
      currency: normalizedCurrency,
    });

    return this._formatWallet(wallet);
  }

  /**
   * Top-up a wallet.
   * @param {string} walletId
   * @param {string|number} amount
   * @param {string} [description]
   * @returns {Promise<{ wallet: object, ledger_entry: object }>}
   */
  async topUp(walletId, amount, description) {
    const validation = validateAmount(amount);
    if (!validation.valid) throw new ValidationError(validation.error);
    const parsedAmount = validation.amount;

    return this.knex.transaction(async (trx) => {
      const wallet = await WalletModel.findByIdForUpdate(trx, walletId);
      if (!wallet) throw new WalletNotFoundError(walletId);
      if (wallet.status === WALLET_STATUS.SUSPENDED) throw new WalletSuspendedError(walletId);

      const newBalance = addAmounts(wallet.balance, parsedAmount.toString());
      const updatedWallet = await WalletModel.updateBalance(trx, walletId, newBalance);

      const ledgerEntry = await LedgerModel.append(trx, {
        wallet_id: walletId,
        type: LEDGER_TYPE.TOPUP,
        amount: parsedAmount.toString(),
        currency: wallet.currency,
        balance_after: newBalance,
        description: description || `Top-up of ${formatAmount(parsedAmount.toString())} ${wallet.currency}`,
      });

      return {
        wallet: this._formatWallet(updatedWallet),
        ledger_entry: this._formatLedgerEntry(ledgerEntry),
      };
    });
  }

  /**
   * Deduct funds from a wallet.
   * @param {string} walletId
   * @param {string|number} amount
   * @param {string} [description]
   * @returns {Promise<{ wallet: object, ledger_entry: object }>}
   */
  async pay(walletId, amount, description) {
    const validation = validateAmount(amount);
    if (!validation.valid) throw new ValidationError(validation.error);
    const parsedAmount = validation.amount;

    return this.knex.transaction(async (trx) => {
      const wallet = await WalletModel.findByIdForUpdate(trx, walletId);
      if (!wallet) throw new WalletNotFoundError(walletId);
      if (wallet.status === WALLET_STATUS.SUSPENDED) throw new WalletSuspendedError(walletId);

      if (!isGreaterOrEqual(wallet.balance, parsedAmount.toString())) {
        throw new InsufficientFundsError(
          `Insufficient funds: balance ${formatAmount(wallet.balance)} < payment ${formatAmount(parsedAmount.toString())}`
        );
      }

      const newBalance = subtractAmounts(wallet.balance, parsedAmount.toString());
      const updatedWallet = await WalletModel.updateBalance(trx, walletId, newBalance);

      const ledgerEntry = await LedgerModel.append(trx, {
        wallet_id: walletId,
        type: LEDGER_TYPE.PAYMENT,
        amount: parsedAmount.toString(),
        currency: wallet.currency,
        balance_after: newBalance,
        description: description || `Payment of ${formatAmount(parsedAmount.toString())} ${wallet.currency}`,
      });

      return {
        wallet: this._formatWallet(updatedWallet),
        ledger_entry: this._formatLedgerEntry(ledgerEntry),
      };
    });
  }

  /**
   * Transfer between two wallets (same currency only).
   * Wallets are locked in sorted ID order to prevent deadlocks.
   * @param {string} fromWalletId
   * @param {string} toWalletId
   * @param {string|number} amount
   * @param {string} [description]
   * @returns {Promise<object>}
   */
  async transfer(fromWalletId, toWalletId, amount, description) {
    if (fromWalletId === toWalletId) {
      throw new ValidationError('Cannot transfer to the same wallet');
    }

    const validation = validateAmount(amount);
    if (!validation.valid) throw new ValidationError(validation.error);
    const parsedAmount = validation.amount;

    return this.knex.transaction(async (trx) => {
      // Lock wallets in consistent order to avoid deadlocks
      const [firstId, secondId] = fromWalletId < toWalletId
        ? [fromWalletId, toWalletId]
        : [toWalletId, fromWalletId];

      const firstWallet = await WalletModel.findByIdForUpdate(trx, firstId);
      const secondWallet = await WalletModel.findByIdForUpdate(trx, secondId);

      const fromWallet = firstId === fromWalletId ? firstWallet : secondWallet;
      const toWallet = firstId === toWalletId ? firstWallet : secondWallet;

      if (!fromWallet) throw new WalletNotFoundError(fromWalletId);
      if (!toWallet) throw new WalletNotFoundError(toWalletId);
      if (fromWallet.status === WALLET_STATUS.SUSPENDED) throw new WalletSuspendedError(fromWalletId);
      if (toWallet.status === WALLET_STATUS.SUSPENDED) throw new WalletSuspendedError(toWalletId);

      if (fromWallet.currency !== toWallet.currency) {
        throw new CurrencyMismatchError(fromWallet.currency, toWallet.currency);
      }

      if (!isGreaterOrEqual(fromWallet.balance, parsedAmount.toString())) {
        throw new InsufficientFundsError(
          `Insufficient funds: balance ${formatAmount(fromWallet.balance)} < transfer ${formatAmount(parsedAmount.toString())}`
        );
      }

      const fromNewBalance = subtractAmounts(fromWallet.balance, parsedAmount.toString());
      const toNewBalance = addAmounts(toWallet.balance, parsedAmount.toString());

      const updatedFromWallet = await WalletModel.updateBalance(trx, fromWalletId, fromNewBalance);
      const updatedToWallet = await WalletModel.updateBalance(trx, toWalletId, toNewBalance);

      const referenceId = crypto.randomUUID();
      const transferDesc = description || `Transfer of ${formatAmount(parsedAmount.toString())} ${fromWallet.currency}`;

      const debitEntry = await LedgerModel.append(trx, {
        wallet_id: fromWalletId,
        type: LEDGER_TYPE.TRANSFER_OUT,
        amount: parsedAmount.toString(),
        currency: fromWallet.currency,
        balance_after: fromNewBalance,
        reference_id: referenceId,
        description: `${transferDesc} to wallet ${toWalletId}`,
      });

      const creditEntry = await LedgerModel.append(trx, {
        wallet_id: toWalletId,
        type: LEDGER_TYPE.TRANSFER_IN,
        amount: parsedAmount.toString(),
        currency: toWallet.currency,
        balance_after: toNewBalance,
        reference_id: referenceId,
        description: `${transferDesc} from wallet ${fromWalletId}`,
      });

      return {
        from_wallet: this._formatWallet(updatedFromWallet),
        to_wallet: this._formatWallet(updatedToWallet),
        debit_entry: this._formatLedgerEntry(debitEntry),
        credit_entry: this._formatLedgerEntry(creditEntry),
      };
    });
  }

  /**
   * Suspend a wallet. Idempotent — safe to call on already-suspended wallets.
   * @param {string} walletId
   * @returns {Promise<object>}
   */
  async suspendWallet(walletId) {
    const wallet = await WalletModel.findById(this.knex, walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);

    if (wallet.status === WALLET_STATUS.SUSPENDED) return this._formatWallet(wallet);

    const updated = await WalletModel.updateStatus(this.knex, walletId, WALLET_STATUS.SUSPENDED);
    return this._formatWallet(updated);
  }

  /**
   * Get wallet with ledger integrity check.
   * @param {string} walletId
   * @returns {Promise<object>}
   */
  async getWallet(walletId) {
    const wallet = await WalletModel.findById(this.knex, walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);

    const computedBalance = await LedgerModel.computeBalance(this.knex, walletId);
    const isConsistent = formatAmount(wallet.balance) === formatAmount(computedBalance);

    return { ...this._formatWallet(wallet), ledger_consistent: isConsistent };
  }

  /**
   * Get paginated ledger entries for a wallet.
   * @param {string} walletId
   * @param {number} [page]
   * @param {number} [limit]
   * @returns {Promise<{ entries: object[], pagination: object }>}
   */
  async getWalletLedger(walletId, page = 1, limit = 50) {
    const wallet = await WalletModel.findById(this.knex, walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);

    const { entries, pagination } = await LedgerModel.findByWalletId(this.knex, walletId, { page, limit });
    return { entries: entries.map((e) => this._formatLedgerEntry(e)), pagination };
  }

  /**
   * Get all wallets for a user.
   * @param {string} ownerId
   * @returns {Promise<object[]>}
   */
  async getWalletsByOwner(ownerId) {
    if (!ownerId || typeof ownerId !== 'string' || ownerId.trim() === '') {
      throw new ValidationError('owner_id is required');
    }
    const wallets = await WalletModel.findAllByOwner(this.knex, ownerId);
    return wallets.map((w) => this._formatWallet(w));
  }

  _formatWallet(wallet) {
    return {
      wallet_id: wallet.wallet_id,
      owner_id: wallet.owner_id,
      currency: wallet.currency,
      balance: formatAmount(wallet.balance),
      status: wallet.status,
      created_at: wallet.created_at,
      updated_at: wallet.updated_at,
    };
  }

  _formatLedgerEntry(entry) {
    return {
      entry_id: entry.entry_id,
      wallet_id: entry.wallet_id,
      type: entry.type,
      amount: formatAmount(entry.amount),
      currency: entry.currency,
      balance_after: formatAmount(entry.balance_after),
      reference_id: entry.reference_id,
      description: entry.description,
      created_at: entry.created_at,
    };
  }
}
