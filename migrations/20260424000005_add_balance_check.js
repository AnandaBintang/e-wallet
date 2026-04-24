/**
 * Migration: add CHECK constraint to ensure balance >= 0 at the DB level
 */

export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE wallets
    ADD CONSTRAINT wallets_balance_check
    CHECK (balance >= 0);
  `);
}

export async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE wallets
    DROP CONSTRAINT wallets_balance_check;
  `);
}
