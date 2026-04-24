/**
 * Migration: create indexes for query performance
 */

export async function up(knex) {
  // Lookup by owner (used in list + create-duplicate check)
  await knex.schema.table('wallets', (table) => {
    table.index(['owner_id'], 'idx_wallets_owner_id');
  });

  // Partial index: active wallets per owner (used in active-wallet queries)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wallets_owner_active
      ON wallets(owner_id)
      WHERE status = 'ACTIVE'
  `);

  // Composite covering index: wallet + time order (used in paginated ledger)
  await knex.schema.table('ledger', (table) => {
    table.index(['wallet_id', 'created_at', 'entry_id'], 'idx_ledger_wallet_created');
  });

  // Filtered index: reference_id lookup for transfer pairs (skips null rows)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ledger_reference_id
      ON ledger(reference_id)
      WHERE reference_id IS NOT NULL
  `);

  // TTL / cleanup support for idempotency table
  await knex.schema.table('idempotency_keys', (table) => {
    table.index(['created_at'], 'idx_idempotency_created');
  });
}

export async function down(knex) {
  await knex.schema.table('idempotency_keys', (table) => {
    table.dropIndex([], 'idx_idempotency_created');
  });

  await knex.raw('DROP INDEX IF EXISTS idx_ledger_reference_id');

  await knex.schema.table('ledger', (table) => {
    table.dropIndex([], 'idx_ledger_wallet_created');
  });

  await knex.raw('DROP INDEX IF EXISTS idx_wallets_owner_active');

  await knex.schema.table('wallets', (table) => {
    table.dropIndex([], 'idx_wallets_owner_id');
  });
}
