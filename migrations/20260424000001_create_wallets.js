/**
 * Migration: create wallets table
 */

export async function up(knex) {
  await knex.schema.createTable('wallets', (table) => {
    table.string('wallet_id', 36).primary();
    table.string('owner_id', 255).notNullable();
    table.string('currency', 3).notNullable().checkLength('=', 3);
    table.decimal('balance', 20, 2).notNullable().defaultTo(0.00);
    table.enu('status', ['ACTIVE', 'SUSPENDED']).notNullable().defaultTo('ACTIVE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['owner_id', 'currency']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('wallets');
}
