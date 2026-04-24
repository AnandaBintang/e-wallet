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

describe('Ledger Integrity', () => {
  it('should maintain balance === sum(ledger) after multiple operations', async () => {
    const createRes = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const walletId = createRes.body.data.wallet_id;

    await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '1000.00' });
    await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '150.50' });
    await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '200.25' });
    await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '99.99' });
    await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '50.00' });

    const walletRes = await request(app).get(`/api/wallets/${walletId}`);
    expect(walletRes.body.data.ledger_consistent).toBe(true);
    // 1000 - 150.50 + 200.25 - 99.99 + 50.00 = 999.76
    expect(walletRes.body.data.balance).toBe('999.76');
  });

  it('should maintain consistency after transfers', async () => {
    const w1 = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const w2 = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'USD' });
    const w1Id = w1.body.data.wallet_id;
    const w2Id = w2.body.data.wallet_id;

    await request(app).post(`/api/wallets/${w1Id}/topup`).send({ amount: '500.00' });
    await request(app)
      .post('/api/wallets/transfer')
      .send({ from_wallet_id: w1Id, to_wallet_id: w2Id, amount: '250.75' });

    const s1 = await request(app).get(`/api/wallets/${w1Id}`);
    const s2 = await request(app).get(`/api/wallets/${w2Id}`);

    expect(s1.body.data.balance).toBe('249.25');
    expect(s1.body.data.ledger_consistent).toBe(true);
    expect(s2.body.data.balance).toBe('250.75');
    expect(s2.body.data.ledger_consistent).toBe(true);
  });

  it('should create linked transfer entries with shared reference_id', async () => {
    const w1 = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const w2 = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'USD' });
    const w1Id = w1.body.data.wallet_id;
    const w2Id = w2.body.data.wallet_id;

    await request(app).post(`/api/wallets/${w1Id}/topup`).send({ amount: '100.00' });
    const transferRes = await request(app)
      .post('/api/wallets/transfer')
      .send({ from_wallet_id: w1Id, to_wallet_id: w2Id, amount: '50.00' });

    const refId = transferRes.body.data.debit_entry.reference_id;
    expect(refId).toBeDefined();
    expect(transferRes.body.data.credit_entry.reference_id).toBe(refId);

    const l1 = await request(app).get(`/api/wallets/${w1Id}/ledger`);
    const l2 = await request(app).get(`/api/wallets/${w2Id}/ledger`);

    const out = l1.body.data.entries.find((e) => e.type === 'TRANSFER_OUT');
    const inEntry = l2.body.data.entries.find((e) => e.type === 'TRANSFER_IN');

    expect(out.reference_id).toBe(refId);
    expect(inEntry.reference_id).toBe(refId);
    expect(out.amount).toBe('50.00');
    expect(inEntry.amount).toBe('50.00');
  });

  it('should not create ledger entries on failed operations', async () => {
    const w = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
    const walletId = w.body.data.wallet_id;

    await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '50.00' });
    await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '100.00' }); // fails

    const ledgerRes = await request(app).get(`/api/wallets/${walletId}/ledger`);
    expect(ledgerRes.body.data.entries).toHaveLength(1);
    expect(ledgerRes.body.data.entries[0].type).toBe('TOPUP');
  });
});
