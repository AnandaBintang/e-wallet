import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import createApp from '../src/app.js';
import { createKnex } from '../src/config/database.js';

let knex;
let app;

beforeAll(async () => {
  knex = createKnex({ database: process.env.DB_NAME_TEST || 'ewallet_test' }, 'test');
  await knex.migrate.rollback({ all: true });
  await knex.migrate.latest();
  app = createApp(knex);
});

afterAll(async () => {
  await knex.migrate.rollback({ all: true });
  await knex.destroy();
});

beforeEach(async () => {
  await knex('ledger').delete();
  await knex('wallets').delete();
  await knex('idempotency_keys').delete();
});

describe('Concurrent Operations', () => {
  it('should handle concurrent top-ups correctly (total must be sum of all)', async () => {
    const createRes = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const walletId = createRes.body.data.wallet_id;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' })
      )
    );

    results.forEach((res) => { expect(res.status).toBe(200); });

    const walletRes = await request(app).get(`/api/wallets/${walletId}`);
    expect(walletRes.body.data.balance).toBe('1000.00');
    expect(walletRes.body.data.ledger_consistent).toBe(true);
  });

  it('should prevent concurrent payments from overdrawing balance', async () => {
    const createRes = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const walletId = createRes.body.data.wallet_id;

    await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '20.00' })
      )
    );

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 400);

    expect(successes.length).toBe(5);
    expect(failures.length).toBe(5);

    const walletRes = await request(app).get(`/api/wallets/${walletId}`);
    expect(walletRes.body.data.balance).toBe('0.00');
    expect(walletRes.body.data.ledger_consistent).toBe(true);
  });

  it('should handle concurrent transfers atomically', async () => {
    const w1 = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const w2 = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'USD' });
    const w1Id = w1.body.data.wallet_id;
    const w2Id = w2.body.data.wallet_id;

    await request(app).post(`/api/wallets/${w1Id}/topup`).send({ amount: '500.00' });
    await request(app).post(`/api/wallets/${w2Id}/topup`).send({ amount: '500.00' });

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        request(app).post('/api/wallets/transfer').send({ from_wallet_id: w1Id, to_wallet_id: w2Id, amount: '10.00' })
      );
      promises.push(
        request(app).post('/api/wallets/transfer').send({ from_wallet_id: w2Id, to_wallet_id: w1Id, amount: '10.00' })
      );
    }

    await Promise.all(promises);

    const s1 = await request(app).get(`/api/wallets/${w1Id}`);
    const s2 = await request(app).get(`/api/wallets/${w2Id}`);

    const total = parseFloat(s1.body.data.balance) + parseFloat(s2.body.data.balance);
    expect(total).toBe(1000.00);
    expect(s1.body.data.ledger_consistent).toBe(true);
    expect(s2.body.data.ledger_consistent).toBe(true);
  });
});
