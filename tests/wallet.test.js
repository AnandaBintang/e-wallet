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

describe('Wallet API', () => {
  // WALLET CREATION
  describe('POST /api/wallets — Create Wallet', () => {
    it('should create a wallet successfully', async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.owner_id).toBe('user1');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.balance).toBe('0.00');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.wallet_id).toBeDefined();
    });

    it('should create multiple wallets for different currencies', async () => {
      await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'EUR' });

      expect(res.status).toBe(201);
      expect(res.body.data.currency).toBe('EUR');
    });

    it('should reject duplicate wallet (same owner + currency)', async () => {
      await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should reject unsupported currency', async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'XYZ' });
      expect(res.status).toBe(400);
    });

    it('should reject missing owner_id', async () => {
      const res = await request(app).post('/api/wallets').send({ currency: 'USD' });
      expect(res.status).toBe(400);
    });

    it('should reject missing currency', async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1' });
      expect(res.status).toBe(400);
    });

    it('should normalize currency to uppercase', async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'usd' });
      expect(res.status).toBe(201);
      expect(res.body.data.currency).toBe('USD');
    });
  });

  // TOP-UP
  describe('POST /api/wallets/:id/topup — Top-Up', () => {
    let walletId;

    beforeEach(async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = res.body.data.wallet_id;
    });

    it('should top-up successfully with decimal amount', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '1000.50' });

      expect(res.status).toBe(200);
      expect(res.body.data.wallet.balance).toBe('1000.50');
      expect(res.body.data.ledger_entry.type).toBe('TOPUP');
      expect(res.body.data.ledger_entry.amount).toBe('1000.50');
    });

    it('should round 12.345 to 12.35', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '12.345' });
      expect(res.status).toBe(200);
      expect(res.body.data.wallet.balance).toBe('12.35');
    });

    it('should handle multiple top-ups correctly', async () => {
      await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' });
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '50.50' });
      expect(res.body.data.wallet.balance).toBe('150.50');
    });

    it('should reject zero amount', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '0.00' });
      expect(res.status).toBe(400);
    });

    it('should reject negative amount', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '-10.00' });
      expect(res.status).toBe(400);
    });

    it('should reject amount less than smallest unit (0.001)', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '0.001' });
      expect(res.status).toBe(400);
    });

    it('should handle large top-up (1 billion)', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '1000000000.00' });
      expect(res.status).toBe(200);
      expect(res.body.data.wallet.balance).toBe('1000000000.00');
    });

    it('should reject top-up to non-existent wallet', async () => {
      const res = await request(app).post('/api/wallets/nonexistent-id/topup').send({ amount: '100.00' });
      expect(res.status).toBe(404);
    });

    it('should reject top-up to suspended wallet', async () => {
      await request(app).post(`/api/wallets/${walletId}/suspend`);
      const res = await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' });
      expect(res.status).toBe(403);
    });
  });

  // PAYMENT
  describe('POST /api/wallets/:id/pay — Payment', () => {
    let walletId;

    beforeEach(async () => {
      const createRes = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = createRes.body.data.wallet_id;
      await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '500.00' });
    });

    it('should pay successfully', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '200.10' });
      expect(res.status).toBe(200);
      expect(res.body.data.wallet.balance).toBe('299.90');
      expect(res.body.data.ledger_entry.type).toBe('PAYMENT');
    });

    it('should reject payment exceeding balance', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '600.00' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should allow paying exact balance', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '500.00' });
      expect(res.status).toBe(200);
      expect(res.body.data.wallet.balance).toBe('0.00');
    });

    it('should reject payment from suspended wallet', async () => {
      await request(app).post(`/api/wallets/${walletId}/suspend`);
      const res = await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '10.00' });
      expect(res.status).toBe(403);
    });
  });

  // TRANSFER
  describe('POST /api/wallets/transfer — Transfer', () => {
    let wallet1Id, wallet2Id;

    beforeEach(async () => {
      const res1 = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      wallet1Id = res1.body.data.wallet_id;
      const res2 = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'USD' });
      wallet2Id = res2.body.data.wallet_id;
      await request(app).post(`/api/wallets/${wallet1Id}/topup`).send({ amount: '1000.50' });
    });

    it('should transfer successfully (same currency)', async () => {
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: wallet2Id, amount: '300.40' });

      expect(res.status).toBe(200);
      expect(res.body.data.from_wallet.balance).toBe('700.10');
      expect(res.body.data.to_wallet.balance).toBe('300.40');
      expect(res.body.data.debit_entry.type).toBe('TRANSFER_OUT');
      expect(res.body.data.credit_entry.type).toBe('TRANSFER_IN');
      expect(res.body.data.debit_entry.reference_id).toBe(res.body.data.credit_entry.reference_id);
    });

    it('should reject cross-currency transfer', async () => {
      const eurRes = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'EUR' });
      const eurWalletId = eurRes.body.data.wallet_id;

      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: eurWalletId, amount: '100.00' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CURRENCY_MISMATCH');
    });

    it('should reject transfer with insufficient funds', async () => {
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: wallet2Id, amount: '9999.00' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should reject transfer to non-existent wallet', async () => {
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: 'nonexistent', amount: '100.00' });

      expect(res.status).toBe(404);
    });

    it('should reject transfer to same wallet', async () => {
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: wallet1Id, amount: '100.00' });

      expect(res.status).toBe(400);
    });

    it('should reject transfer from suspended wallet', async () => {
      await request(app).post(`/api/wallets/${wallet1Id}/suspend`);
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: wallet2Id, amount: '100.00' });

      expect(res.status).toBe(403);
    });

    it('should reject transfer to suspended wallet', async () => {
      await request(app).post(`/api/wallets/${wallet2Id}/suspend`);
      const res = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: wallet1Id, to_wallet_id: wallet2Id, amount: '100.00' });

      expect(res.status).toBe(403);
    });
  });

  // SUSPEND
  describe('POST /api/wallets/:id/suspend — Suspend', () => {
    let walletId;

    beforeEach(async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = res.body.data.wallet_id;
    });

    it('should suspend a wallet', async () => {
      const res = await request(app).post(`/api/wallets/${walletId}/suspend`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it('should be idempotent (suspend already suspended wallet)', async () => {
      await request(app).post(`/api/wallets/${walletId}/suspend`);
      const res = await request(app).post(`/api/wallets/${walletId}/suspend`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it('should reject suspending non-existent wallet', async () => {
      const res = await request(app).post('/api/wallets/nonexistent/suspend');
      expect(res.status).toBe(404);
    });
  });

  // QUERY
  describe('GET /api/wallets/:id — Query Wallet', () => {
    let walletId;

    beforeEach(async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = res.body.data.wallet_id;
    });

    it('should return wallet status and balance', async () => {
      await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' });
      const res = await request(app).get(`/api/wallets/${walletId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.balance).toBe('100.00');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.ledger_consistent).toBe(true);
    });

    it('should show ledger consistency after operations', async () => {
      await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '500.00' });
      await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '100.00' });
      const res = await request(app).get(`/api/wallets/${walletId}`);

      expect(res.body.data.balance).toBe('400.00');
      expect(res.body.data.ledger_consistent).toBe(true);
    });

    it('should return 404 for non-existent wallet', async () => {
      const res = await request(app).get('/api/wallets/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // LEDGER
  describe('GET /api/wallets/:id/ledger — Wallet Ledger', () => {
    let walletId;

    beforeEach(async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = res.body.data.wallet_id;
    });

    it('should return empty ledger for new wallet', async () => {
      const res = await request(app).get(`/api/wallets/${walletId}/ledger`);
      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(0);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('should return all ledger entries in order', async () => {
      await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '100.00' });
      await request(app).post(`/api/wallets/${walletId}/pay`).send({ amount: '30.00' });

      const res = await request(app).get(`/api/wallets/${walletId}/ledger`);

      expect(res.body.data.entries).toHaveLength(2);
      expect(res.body.data.entries[0].type).toBe('TOPUP');
      expect(res.body.data.entries[0].amount).toBe('100.00');
      expect(res.body.data.entries[1].type).toBe('PAYMENT');
      expect(res.body.data.entries[1].amount).toBe('30.00');
    });

    it('should paginate ledger entries', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post(`/api/wallets/${walletId}/topup`).send({ amount: '10.00' });
      }

      const res = await request(app).get(`/api/wallets/${walletId}/ledger?page=1&limit=3`);
      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(3);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.has_more).toBe(true);

      const res2 = await request(app).get(`/api/wallets/${walletId}/ledger?page=2&limit=3`);
      expect(res2.body.data.entries).toHaveLength(2);
      expect(res2.body.data.pagination.has_more).toBe(false);
    });
  });

  // OWNER WALLETS
  describe('GET /api/wallets/owner/:ownerId — List Owner Wallets', () => {
    it('should list all wallets for a user', async () => {
      await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'EUR' });
      const res = await request(app).get('/api/wallets/owner/user1');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty array for user with no wallets', async () => {
      const res = await request(app).get('/api/wallets/owner/nobody');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // IDEMPOTENCY
  describe('Idempotency-Key', () => {
    let walletId;

    beforeEach(async () => {
      const res = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      walletId = res.body.data.wallet_id;
    });

    it('should return same response for duplicate top-up requests', async () => {
      const key = 'unique-topup-key-123';

      const res1 = await request(app)
        .post(`/api/wallets/${walletId}/topup`)
        .set('Idempotency-Key', key)
        .send({ amount: '100.00' });

      const res2 = await request(app)
        .post(`/api/wallets/${walletId}/topup`)
        .set('Idempotency-Key', key)
        .send({ amount: '100.00' });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-idempotent-replayed']).toBe('true');

      const walletRes = await request(app).get(`/api/wallets/${walletId}`);
      expect(walletRes.body.data.balance).toBe('100.00');
    });
  });

  // COMPLETE SCENARIO
  describe('Complete Sample Scenario', () => {
    it('should execute the full sample usage flow correctly', async () => {
      const w1usd = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'USD' });
      const w1eur = await request(app).post('/api/wallets').send({ owner_id: 'user1', currency: 'EUR' });
      const w2usd = await request(app).post('/api/wallets').send({ owner_id: 'user2', currency: 'USD' });

      const user1UsdId = w1usd.body.data.wallet_id;
      const user1EurId = w1eur.body.data.wallet_id;
      const user2UsdId = w2usd.body.data.wallet_id;

      await request(app).post(`/api/wallets/${user1UsdId}/topup`).send({ amount: '1000.50' });
      await request(app).post(`/api/wallets/${user1EurId}/topup`).send({ amount: '500.25' });
      await request(app).post(`/api/wallets/${user2UsdId}/topup`).send({ amount: '200.75' });

      await request(app).post(`/api/wallets/${user1UsdId}/pay`).send({ amount: '200.10' });
      await request(app).post(`/api/wallets/${user1EurId}/pay`).send({ amount: '100.50' });

      const transferRes = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: user1UsdId, to_wallet_id: user2UsdId, amount: '300.40' });
      expect(transferRes.status).toBe(200);

      const crossRes = await request(app)
        .post('/api/wallets/transfer')
        .send({ from_wallet_id: user1EurId, to_wallet_id: user2UsdId, amount: '100.00' });
      expect(crossRes.status).toBe(400);
      expect(crossRes.body.error.code).toBe('CURRENCY_MISMATCH');

      const s1usd = await request(app).get(`/api/wallets/${user1UsdId}`);
      const s1eur = await request(app).get(`/api/wallets/${user1EurId}`);
      const s2usd = await request(app).get(`/api/wallets/${user2UsdId}`);

      expect(s1usd.body.data.balance).toBe('500.00');
      expect(s1usd.body.data.ledger_consistent).toBe(true);
      expect(s1eur.body.data.balance).toBe('399.75');
      expect(s1eur.body.data.ledger_consistent).toBe(true);
      expect(s2usd.body.data.balance).toBe('501.15');
      expect(s2usd.body.data.ledger_consistent).toBe(true);
    });
  });
});
