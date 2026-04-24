import 'dotenv/config';
import createApp from './app.js';
import { createKnex } from './config/database.js';

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function main() {
  const knex = createKnex();

  try {
    await knex.migrate.latest();
    console.log('Database migrations up to date');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }

  const app = createApp(knex);

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API Docs: http://localhost:${PORT}/api-docs`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} — shutting down`);
    server.close(async () => {
      await knex.destroy();
      console.log('Server stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
