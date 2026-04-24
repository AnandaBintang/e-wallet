# Multi-Currency E-Wallet Backend

A ledger-based, multi-currency E-Wallet backend system built with **Express.js** and **PostgreSQL**. Features safe decimal arithmetic, ACID transactions, idempotent operations, and comprehensive edge case handling.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Server](#running-the-server)
- [Running Tests](#running-tests)
- [API Documentation](#api-documentation)
- [Design Decisions & Assumptions](#design-decisions--assumptions)
- [Edge Case Handling](#edge-case-handling)

---

## Architecture

```
src/
├── app.js                    # Express app factory
├── server.js                 # Entry point with graceful shutdown
├── config/database.js        # PostgreSQL pool + schema init
├── middleware/
│   ├── errorHandler.js       # Global error → JSON response mapper
│   ├── validateRequest.js    # express-validator chains per route
│   └── idempotency.js        # Idempotency-Key dedup middleware
├── models/
│   ├── wallet.js             # Wallet CRUD + FOR UPDATE locking
│   └── ledger.js             # Append-only ledger + balance computation
├── services/
│   └── walletService.js      # All business logic + transactions
├── routes/
│   └── walletRoutes.js       # Route definitions
└── utils/
    ├── decimal.js            # Safe decimal math (decimal.js)
    ├── errors.js             # Custom error classes
    └── constants.js          # Enums (status, ledger types, currencies)
```

---

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 13

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
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
PORT=3000
NODE_ENV=development
```

### 3. Create databases

```bash
# Main database
createdb ewallet

# Test database
createdb ewallet_test
```

> **Note**: Tables are created automatically on first run via `initializeDatabase()`.

---

## Running the Server

```bash
npm start
# or
npm run dev
```

Output:

```
Database schema initialized
E-Wallet server running on http://localhost:3000
Health check: http://localhost:3000/health
API base: http://localhost:3000/api/wallets
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

> Tests use the `ewallet_test` database. Make sure it exists before running.

---

## API Documentation

### Base URL: `http://localhost:3000/api`

All responses follow the format:

```json
{
  "success": true|false,
  "data": { ... },        // on success
  "error": {              // on failure
    "code": "ERROR_CODE",
    "message": "..."
  }
}
```

### Idempotency

All mutating endpoints support the `Idempotency-Key` header. Send the same key to safely retry requests without double-processing.

---

### 1. Create Wallet

```bash
curl -X POST http://localhost:3000/api/wallets \
  -H "Content-Type: application/json" \
  -d '{"owner_id": "user1", "currency": "USD"}'
```

**Response** (201):

```json
{
  "success": true,
  "data": {
    "wallet_id": "a1b2c3d4-...",
    "owner_id": "user1",
    "currency": "USD",
    "balance": "0.00",
    "status": "ACTIVE",
    "created_at": "2026-04-24T...",
    "updated_at": "2026-04-24T..."
  }
}
```

### 2. Top-Up

```bash
curl -X POST http://localhost:3000/api/wallets/{wallet_id}/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: topup-001" \
  -d '{"amount": "1000.50"}'
```

### 3. Payment

```bash
curl -X POST http://localhost:3000/api/wallets/{wallet_id}/pay \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pay-001" \
  -d '{"amount": "200.10"}'
```

### 4. Transfer

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

### 5. Suspend Wallet

```bash
curl -X POST http://localhost:3000/api/wallets/{wallet_id}/suspend
```

### 6. Get Wallet Status

```bash
curl http://localhost:3000/api/wallets/{wallet_id}
```

**Response** includes `ledger_consistent: true|false` — verifying that the balance matches the sum of all ledger entries.

### 7. Get Wallet Ledger

```bash
curl http://localhost:3000/api/wallets/{wallet_id}/ledger
```

### 8. List User's Wallets

```bash
curl http://localhost:3000/api/wallets/owner/{owner_id}
```

### 9. Health Check

```bash
curl http://localhost:3000/health
```

---

## Design Decisions & Assumptions

### Money Handling

- All monetary values use `decimal.js` — **never native JavaScript floats**
- Amounts are rounded to **2 decimal places** using **ROUND_HALF_UP** (banker's convention)
- Stored as `NUMERIC(20,2)` in PostgreSQL (exact decimal, up to 999,999,999,999,999,999.99)
- Minimum operation amount: **0.01**

### Database

- **PostgreSQL** with `pg` driver and connection pooling
- Schema auto-created via `initializeDatabase()` on startup
- `UNIQUE(owner_id, currency)` constraint enforces one wallet per currency per user

### Transactions & Concurrency

- All mutating operations run in PostgreSQL transactions (`BEGIN`/`COMMIT`/`ROLLBACK`)
- `SELECT ... FOR UPDATE` acquires row-level locks to prevent double-spending
- Transfer operations lock wallets in **sorted ID order** to prevent deadlocks
- Concurrent operations are safe — PostgreSQL serializes conflicting writes

### Idempotency

- Clients can send an `Idempotency-Key` header on mutating requests
- Duplicate keys return the cached response without re-execution
- Keys are persisted to PostgreSQL for durability across restarts

### Ledger

- Append-only — entries are never updated or deleted
- Every balance change creates a corresponding ledger entry
- `getWallet` verifies `balance === SUM(ledger)` on every query
- Transfer operations create two linked entries sharing a `reference_id`

### Supported Currencies

- USD, EUR, GBP, JPY, IDR, SGD, AUD, CAD, CHF, CNY, HKD, KRW, MYR, NZD, PHP, THB, TWD, VND, INR, BRL

---

## Edge Case Handling

| Edge Case                | Handling                                           |
| ------------------------ | -------------------------------------------------- |
| `12.345` top-up          | Rounded to `12.35` (ROUND_HALF_UP)                 |
| `0.001` payment          | Rejected — rounds to `0.00`, below minimum         |
| 1 billion balance        | ✅ Supported by NUMERIC(20,2)                      |
| Cross-currency transfer  | Rejected with `CURRENCY_MISMATCH`                  |
| Duplicate wallet         | Rejected with `DUPLICATE_WALLET` (409)             |
| Zero/negative amounts    | Rejected by validation                             |
| Duplicate requests       | Idempotency-Key returns cached response            |
| Concurrent spending      | FOR UPDATE row locks prevent overdraw              |
| Partial transfer failure | Single transaction — atomic rollback               |
| Balance ≠ ledger         | Detected via integrity check on `GET /wallets/:id` |
| Suspended wallet         | All operations return `403 WALLET_SUSPENDED`       |
| Crash recovery           | PostgreSQL WAL ensures consistency                 |
