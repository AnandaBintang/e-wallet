import knexLib from 'knex';
import knexConfig from '../../knexfile.js';

/**
 * Creates a Knex instance for the given environment.
 * Reads connection config from knexfile.js which is driven by env vars.
 *
 * @param {object} [overrides] - Optional connection overrides (useful in tests)
 * @param {string} [env]       - 'development' | 'test' | 'production'
 * @returns {import('knex').Knex}
 */
export function createKnex(overrides = {}, env = process.env.NODE_ENV || 'development') {
  const config = knexConfig[env] ?? knexConfig.development;

  return knexLib({
    ...config,
    connection: {
      ...config.connection,
      ...overrides,
    },
  });
}
