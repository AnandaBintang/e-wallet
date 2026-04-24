/**
 * Migration: create ledger table
 */

export async function up(knex) {
  await knex.schema.createTable('ledger', (table) => {
    table.increments('entry_id').primary();
    table.string('wallet_id', 36).notNullable().references('wallet_id').inTable('wallets').onDelete('RESTRICT');
    table
      .enu('type', ['TOPUP', 'PAYMENT', 'TRANSFER_IN', 'TRANSFER_OUT'])
      .notNullable();
    table.decimal('amount', 20, 2).notNullable();
    table.string('currency', 3).notNullable();
    table.decimal('balance_after', 20, 2).notNullable();
    table.string('reference_id', 36).nullable();
    table.text('description').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ledger');
}
