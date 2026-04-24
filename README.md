# Multi-Currency E-Wallet Backend

A ledger-based, multi-currency E-Wallet backend built with **Express.js**, **PostgreSQL**, and **Knex**. Features safe decimal arithmetic, ACID transactions, idempotent operations, versioned migrations, and interactive API docs via Swagger UI.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Server](#running-the-server)
- [Running Tests](#running-tests)
- [API Documentation](#api-documentation)
- [Endpoints](#endpoints)
- [Design Decisions](#design-decisions)
- [Edge Case Handling](#edge-case-handling)

---

## Architecture

```
src/
├── app.js                    # Express app factory
├── server.js                 # Entry point, runs migrations, graceful shutdown
├── config/
│   ├── database.js           # Knex instance factory
│   └── swagger.js            # OpenAPI 3.0 spec (swagger-jsdoc)
├── middleware/
│   ├── errorHandler.js       # Global error → JSON response mapper
│   ├── validateRequest.js    # express-validator chains per route
│   └── idempotency.js        # Idempotency-Key dedup middleware
├── models/
│   ├── wallet.js             # Wallet queries (Knex builder + FOR UPDATE)
│   └── ledger.js             # Append-only ledger, pagination, balance computation
├── services/
│   └── walletService.js      # Business logic inside knex.transaction()
├── routes/
│   └── walletRoutes.js       # Route definitions + @openapi JSDoc annotations
└── utils/
    ├── decimal.js            # Safe decimal math (decimal.js, ROUND_HALF_UP)
    ├── errors.js             # Custom AppError subclasses
    └── constants.js          # Enums: status, ledger types, supported currencies

migrations/
├── 20260424000001_create_wallets.js
├── 20260424000002_create_ledger.js
├── 20260424000003_create_idempotency_keys.js
└── 20260424000004_create_indexes.js
```

---

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL** >= 13

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/AnandaBintang/e-wallet.git
cd e-wallet
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

Default `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ewallet
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME_TEST=ewallet_test
DB_POOL_MAX=20
PORT=3000
NODE_ENV=development
```

### 3. Create databases

```bash
createdb ewallet
createdb ewallet_test
```

### 4. Run migrations

```bash
npm run migrate
```

Migrations are versioned files tracked in a `knex_migrations` table. To roll back:

```bash
npm run migrate:down
```

---

## Running the Server

```bash
npm start
# or
npm run dev
```

On startup, migrations are applied automatically (`knex.migrate.latest()`).

```
Database migrations up to date
Server running on http://localhost:3000
API Docs: http://localhost:3000/api-docs
```

---

## Running Tests

```bash
# Run all tests
npm test

# Verbose output
npm run test:verbose

# With coverage
npm run test:coverage
```

Tests connect to `ewallet_test`, run all migrations fresh in `beforeAll`, and roll back in `afterAll`. Make sure the database exists:

```bash
createdb ewallet_test
```

---

## API Documentation

### Interactive Swagger UI

The full API is documented with OpenAPI 3.0 and served interactively via Swagger UI.

| Resource | URL |
|---|---|
| Swagger UI | http://localhost:3000/api-docs |
| Raw OpenAPI JSON | http://localhost:3000/api-docs.json |
| Health check | http://localhost:3000/health |

Open **http://localhost:3000/api-docs** in your browser to browse all endpoints, view request/response schemas, and try requests directly from the browser.

### Response format

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { }
}
```

On error:

```json
{
  "success": false,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "Wallet not found: abc-123"
  }
}
```

### Idempotency

All mutating endpoints support the `Idempotency-Key` header. Sending the same key on a retry returns the cached response without re-executing the operation.

```bash
curl -X POST http://localhost:3000/api/wallets/{id}/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: topup-user1-2026-04-24-001" \
  -d '{"amount": "100.00"}'
```

---

## Endpoints

### Wallets

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/wallets` | Create a wallet |
| `GET` | `/api/wallets/:id` | Get wallet balance and status |
| `POST` | `/api/wallets/:id/suspend` | Suspend a wallet |
| `GET` | `/api/wallets/owner/:ownerId` | List all wallets for a user |

### Transactions

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/wallets/:id/topup` | Add funds to a wallet |
| `POST` | `/api/wallets/:id/pay` | Deduct funds from a wallet |
| `POST` | `/api/wallets/transfer` | Transfer funds between wallets (same currency) |

### Ledger

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/wallets/:id/ledger` | Get paginated ledger entries (`?page=1&limit=50`) |

---

### Quick examples

**Create wallet**

```bash
curl -X POST http://localhost:3000/api/wallets \
  -H "Content-Type: application/json" \
  -d '{"owner_id": "user1", "currency": "USD"}'
```

**Top-up**

```bash
curl -X POST http://localhost:3000/api/wallets/{wallet_id}/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: topup-001" \
  -d '{"amount": "1000.50", "description": "Monthly salary"}'
```

**Payment**

```bash
curl -X POST http://localhost:3000/api/wallets/{wallet_id}/pay \
  -H "Content-Type: application/json" \
  -d '{"amount": "49.99", "description": "Netflix"}'
```

**Transfer**

```bash
curl -X POST http://localhost:3000/api/wallets/transfer \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: transfer-001" \
  -d '{
    "from_wallet_id": "wallet-a",
    "to_wallet_id": "wallet-b",
    "amount": "300.40"
  }'
```

**Get wallet** (includes ledger integrity check)

```bash
curl http://localhost:3000/api/wallets/{wallet_id}
```

**Get ledger** (paginated)

```bash
curl "http://localhost:3000/api/wallets/{wallet_id}/ledger?page=1&limit=50"
```

---

## Design Decisions

### Money handling

- All arithmetic uses `decimal.js` — never native JavaScript floats
- Amounts rounded to **2 decimal places** (ROUND_HALF_UP)
- Stored as `NUMERIC(20,2)` in PostgreSQL — exact decimal up to 999,999,999,999,999,999.99
- Minimum operation amount: **0.01**

### Migrations

- Schema is managed by **Knex** migrations in `migrations/`, not inline `CREATE TABLE IF NOT EXISTS`
- Applied automatically on server start via `knex.migrate.latest()`
- Tracked in `knex_migrations` table — rollback supported via `npm run migrate:down`

### Query performance

- Composite covering index on `ledger(wallet_id, created_at, entry_id)` for paginated sorts
- Partial index on `wallets(owner_id) WHERE status = 'ACTIVE'` for active-wallet queries
- Filtered index on `ledger(reference_id) WHERE reference_id IS NOT NULL` for transfer lookups
- All queries use explicit column projection — no `SELECT *`
- Ledger uses parallel `COUNT` + `SELECT` for pagination metadata

### Transactions and concurrency

- All mutating operations run inside `knex.transaction()` — automatic BEGIN/COMMIT/ROLLBACK
- `SELECT ... FOR UPDATE` via Knex's `.forUpdate()` acquires row-level locks
- Transfer locks wallets in **sorted ID order** to prevent deadlocks
- Concurrent operations are safe — PostgreSQL serializes conflicting writes

### Idempotency

- Clients send an `Idempotency-Key` header on mutating requests
- Duplicate keys replay the original response without re-executing
- Keys persisted to PostgreSQL for durability across server restarts

### Ledger

- Append-only — entries are never updated or deleted
- Every balance change creates a corresponding ledger entry
- `GET /api/wallets/:id` verifies `balance === SUM(ledger)` on every request
- Transfer creates two linked entries sharing a `reference_id` (debit + credit)

### Supported currencies

USD, EUR, GBP, JPY, IDR, SGD, AUD, CAD, CHF, CNY, HKD, KRW, MYR, NZD, PHP, THB, TWD, VND, INR, BRL

---

## Edge Case Handling

| Edge case | Handling |
|---|---|
| `12.345` top-up | Rounded to `12.35` (ROUND_HALF_UP) |
| `0.001` payment | Rejected — rounds to `0.00`, below minimum |
| 1 billion balance | Supported by `NUMERIC(20,2)` |
| Cross-currency transfer | Rejected with `CURRENCY_MISMATCH` (400) |
| Duplicate wallet | Rejected with `DUPLICATE_WALLET` (409) |
| Zero / negative amounts | Rejected by validation layer |
| Duplicate requests | `Idempotency-Key` replays cached response |
| Concurrent spending | `FOR UPDATE` row locks prevent overdraw |
| Partial transfer failure | Single transaction — fully rolled back |
| Balance mismatch | Detected via integrity check on `GET /wallets/:id` |
| Suspended wallet | All operations return `403 WALLET_SUSPENDED` |
| Crash recovery | PostgreSQL WAL ensures consistency |
