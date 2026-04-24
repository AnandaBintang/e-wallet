import 'dotenv/config';

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  migrations: {
    directory: './migrations',
    extension: 'js',
  },
  pool: {
    min: 2,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    acquireTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
};

const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export default {
  development: {
    ...base,
    connection: { ...connection, database: process.env.DB_NAME || 'ewallet' },
  },

  test: {
    ...base,
    connection: { ...connection, database: process.env.DB_NAME_TEST || 'ewallet_test' },
    pool: { min: 1, max: 5 },
  },

  production: {
    ...base,
    connection: { ...connection, database: process.env.DB_NAME || 'ewallet' },
    pool: {
      min: 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      acquireTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    },
  },
};
