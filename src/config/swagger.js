import swaggerJsdoc from 'swagger-jsdoc';
import { SUPPORTED_CURRENCIES } from '../utils/constants.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-Wallet API',
      version: '1.0.0',
      description: `
Multi-currency E-Wallet backend with ledger-based audit trail.

**Key features:**
- Multiple wallets per user (one per currency)
- Safe decimal arithmetic — no floating-point money math
- Append-only ledger with integrity verification
- Idempotent operations via \`Idempotency-Key\` header
- Row-level locking for concurrent safety

**Supported currencies:** ${SUPPORTED_CURRENCIES.join(', ')}
      `.trim(),
      contact: { name: 'E-Wallet API' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    components: {
      parameters: {
        IdempotencyKey: {
          in: 'header',
          name: 'Idempotency-Key',
          required: false,
          schema: { type: 'string' },
          description: 'Unique key to deduplicate mutating requests. Replays the original response if the key was already used.',
          example: 'topup-user1-2026-04-24-001',
        },
      },
      schemas: {
        Wallet: {
          type: 'object',
          properties: {
            wallet_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-1234-5678-abcd-ef0123456789' },
            owner_id: { type: 'string', example: 'user1' },
            currency: { type: 'string', example: 'USD' },
            balance: { type: 'string', description: 'Exact decimal balance with 2 decimal places', example: '1000.50' },
            status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'], example: 'ACTIVE' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        WalletWithConsistency: {
          allOf: [
            { $ref: '#/components/schemas/Wallet' },
            {
              type: 'object',
              properties: {
                ledger_consistent: {
                  type: 'boolean',
                  description: 'True if wallet balance matches sum of all ledger entries',
                  example: true,
                },
              },
            },
          ],
        },
        LedgerEntry: {
          type: 'object',
          properties: {
            entry_id: { type: 'integer', example: 42 },
            wallet_id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['TOPUP', 'PAYMENT', 'TRANSFER_IN', 'TRANSFER_OUT'] },
            amount: { type: 'string', example: '100.50' },
            currency: { type: 'string', example: 'USD' },
            balance_after: { type: 'string', example: '1100.50' },
            reference_id: { type: 'string', format: 'uuid', nullable: true, description: 'Shared by paired TRANSFER_IN/OUT entries' },
            description: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 50 },
            total: { type: 'integer', example: 120 },
            has_more: { type: 'boolean', example: true },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'WALLET_NOT_FOUND' },
                message: { type: 'string', example: 'Wallet not found: abc-123' },
              },
            },
          },
        },
      },

      // ── Request body schemas ──────────────────────────────────────────
      requestBodies: {
        CreateWalletRequest: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['owner_id', 'currency'],
                properties: {
                  owner_id: {
                    type: 'string',
                    example: 'user1',
                    description: 'Unique identifier for the wallet owner',
                  },
                  currency: {
                    type: 'string',
                    example: 'USD',
                    description: `ISO 4217 currency code (case-insensitive). Supported: ${SUPPORTED_CURRENCIES.join(', ')}`,
                  },
                },
              },
            },
          },
        },
        TopupRequest: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: {
                    type: 'string',
                    example: '100.50',
                    description: 'Decimal amount to add, minimum 0.01. Rounded to 2 dp (ROUND_HALF_UP).',
                  },
                  description: {
                    type: 'string',
                    example: 'Monthly salary',
                    description: 'Optional note for the ledger entry',
                  },
                },
              },
            },
          },
        },
        PayRequest: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: {
                    type: 'string',
                    example: '49.99',
                    description: 'Decimal amount to deduct, minimum 0.01. Must not exceed current balance.',
                  },
                  description: {
                    type: 'string',
                    example: 'Netflix subscription',
                    description: 'Optional note for the ledger entry',
                  },
                },
              },
            },
          },
        },
        TransferRequest: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['from_wallet_id', 'to_wallet_id', 'amount'],
                properties: {
                  from_wallet_id: {
                    type: 'string',
                    format: 'uuid',
                    example: 'a1b2c3d4-1234-5678-abcd-ef0123456789',
                    description: 'Source wallet ID',
                  },
                  to_wallet_id: {
                    type: 'string',
                    format: 'uuid',
                    example: 'b2c3d4e5-2345-6789-bcde-f01234567890',
                    description: 'Destination wallet ID. Must hold the same currency as the source.',
                  },
                  amount: {
                    type: 'string',
                    example: '50.00',
                    description: 'Decimal amount to transfer, minimum 0.01.',
                  },
                  description: {
                    type: 'string',
                    example: 'Rent split',
                    description: 'Optional note attached to both debit and credit ledger entries',
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        NotFound: {
          description: 'Wallet not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Suspended: {
          description: 'Wallet is suspended',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        ValidationError: {
          description: 'Invalid request parameters',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        InsufficientFunds: {
          description: 'Insufficient funds',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    tags: [
      { name: 'Wallets', description: 'Wallet lifecycle operations' },
      { name: 'Transactions', description: 'Financial operations (top-up, payment, transfer)' },
      { name: 'Ledger', description: 'Audit trail and balance history' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
