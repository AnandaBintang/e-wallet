import { formatAmount } from '../utils/decimal.js';

const COLUMNS = [
  'entry_id',
  'wallet_id',
  'type',
  'amount',
  'currency',
  'balance_after',
  'reference_id',
  'description',
  'created_at',
];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Ledger model — append-only ledger entries.
 * Entries are never updated or deleted after creation.
 */
const LedgerModel = {
  /**
   * Append a new ledger entry. Must run inside a transaction.
   * @param {import('knex').Knex.Transaction} trx
   * @param {{ wallet_id, type, amount, currency, balance_after, reference_id?, description? }} entry
   * @returns {Promise<object>}
   */
  async append(trx, entry) {
    const [row] = await trx('ledger')
      .insert({
        wallet_id: entry.wallet_id,
        type: entry.type,
        amount: formatAmount(entry.amount),
        currency: entry.currency,
        balance_after: formatAmount(entry.balance_after),
        reference_id: entry.reference_id ?? null,
        description: entry.description ?? null,
      })
      .returning(COLUMNS);
    return row;
  },

  /**
   * Get paginated ledger entries for a wallet, ordered by time ascending.
   * Uses idx_ledger_wallet_created composite covering index.
   *
   * @param {import('knex').Knex} db
   * @param {string} walletId
   * @param {{ page?: number, limit?: number }} options
   * @returns {Promise<{ entries: object[], pagination: object }>}
   */
  async findByWalletId(db, walletId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
    const offset = (safePage - 1) * safeLimit;

    const [entries, [{ total }]] = await Promise.all([
      db('ledger')
        .select(COLUMNS)
        .where('wallet_id', walletId)
        .orderBy([
          { column: 'created_at', order: 'asc' },
          { column: 'entry_id', order: 'asc' },
        ])
        .limit(safeLimit)
        .offset(offset),

      db('ledger')
        .where('wallet_id', walletId)
        .count('entry_id as total'),
    ]);

    return {
      entries,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: parseInt(total, 10),
        has_more: offset + entries.length < parseInt(total, 10),
      },
    };
  },

  /**
   * Compute expected balance from ledger for integrity checking.
   * @param {import('knex').Knex | import('knex').Knex.Transaction} db
   * @param {string} walletId
   * @returns {Promise<string>}
   */
  async computeBalance(db, walletId) {
    const [row] = await db.raw(`
      SELECT COALESCE(SUM(
        CASE
          WHEN type IN ('TOPUP', 'TRANSFER_IN') THEN amount
          WHEN type IN ('PAYMENT', 'TRANSFER_OUT') THEN -amount
          ELSE 0
        END
      ), 0)::NUMERIC(20,2) AS computed_balance
      FROM ledger
      WHERE wallet_id = ?
    `, [walletId]).then((r) => r.rows);
    return row.computed_balance;
  },
};

export default LedgerModel;
