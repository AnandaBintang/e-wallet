/**
 * Migration: create idempotency_keys table
 */

export async function up(knex) {
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.string('idempotency_key', 255).primary();
    table.integer('response_code').notNullable();
    table.text('response_body').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('idempotency_keys');
}
