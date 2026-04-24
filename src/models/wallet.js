import { formatAmount } from '../utils/decimal.js';

// Columns to select — explicit projection avoids SELECT * and keeps balance as string
const COLUMNS = [
  'wallet_id',
  'owner_id',
  'currency',
  'balance',
  'status',
  'created_at',
  'updated_at',
];

/**
 * Wallet model — all DB operations for wallets.
 * Methods receiving a `trx` run inside an existing Knex transaction.
 * Methods receiving `knex` can be called outside a transaction.
 */
const WalletModel = {
  /**
   * Find a wallet by ID.
   * @param {import('knex').Knex | import('knex').Knex.Transaction} db
   * @param {string} walletId
   * @returns {Promise<object|null>}
   */
  findById(db, walletId) {
    return db('wallets').select(COLUMNS).where('wallet_id', walletId).first() ?? null;
  },

  /**
   * Find a wallet by ID with a row-level lock. Must run inside a transaction.
   * @param {import('knex').Knex.Transaction} trx
   * @param {string} walletId
   * @returns {Promise<object|null>}
   */
  findByIdForUpdate(trx, walletId) {
    return trx('wallets').select(COLUMNS).where('wallet_id', walletId).forUpdate().first() ?? null;
  },

  /**
   * Find a wallet by owner + currency.
   * @param {import('knex').Knex | import('knex').Knex.Transaction} db
   * @param {string} ownerId
   * @param {string} currency
   * @returns {Promise<object|null>}
   */
  findByOwnerAndCurrency(db, ownerId, currency) {
    return db('wallets')
      .select(COLUMNS)
      .where({ owner_id: ownerId, currency: currency.toUpperCase() })
      .first();
  },

  /**
   * Create a new wallet.
   * @param {import('knex').Knex | import('knex').Knex.Transaction} db
   * @param {{ wallet_id: string, owner_id: string, currency: string }} data
   * @returns {Promise<object>}
   */
  async create(db, { wallet_id, owner_id, currency }) {
    const [wallet] = await db('wallets')
      .insert({
        wallet_id,
        owner_id,
        currency: currency.toUpperCase(),
        balance: '0.00',
        status: 'ACTIVE',
      })
      .returning(COLUMNS);
    return wallet;
  },

  /**
   * Update wallet balance. Must run inside a transaction.
   * @param {import('knex').Knex.Transaction} trx
   * @param {string} walletId
   * @param {string} newBalance
   * @returns {Promise<object>}
   */
  async updateBalance(trx, walletId, newBalance) {
    const [wallet] = await trx('wallets')
      .where('wallet_id', walletId)
      .update({ balance: formatAmount(newBalance), updated_at: trx.fn.now() })
      .returning(COLUMNS);
    return wallet;
  },

  /**
   * Update wallet status.
   * @param {import('knex').Knex | import('knex').Knex.Transaction} db
   * @param {string} walletId
   * @param {string} status
   * @returns {Promise<object>}
   */
  async updateStatus(db, walletId, status) {
    const [wallet] = await db('wallets')
      .where('wallet_id', walletId)
      .update({ status, updated_at: db.fn.now() })
      .returning(COLUMNS);
    return wallet;
  },

  /**
   * List all wallets for an owner, ordered by creation time.
   * @param {import('knex').Knex} db
   * @param {string} ownerId
   * @returns {Promise<object[]>}
   */
  findAllByOwner(db, ownerId) {
    return db('wallets').select(COLUMNS).where('owner_id', ownerId).orderBy('created_at', 'asc');
  },
};

export default WalletModel;
