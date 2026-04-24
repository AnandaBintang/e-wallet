import { Router } from 'express';
import validate from '../middleware/validateRequest.js';

/**
 * Creates the wallet router with all API endpoints.
 * @param {import('../services/walletService.js').WalletService} walletService
 * @returns {Router}
 */
export default function createWalletRoutes(walletService) {
  const router = Router();

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets:
   *   post:
   *     summary: Create a wallet
   *     description: Creates a new wallet for a user in a specific currency. Each user may hold one wallet per currency.
   *     tags: [Wallets]
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKey'
   *     requestBody:
   *       $ref: '#/components/requestBodies/CreateWalletRequest'
   *     responses:
   *       201:
   *         description: Wallet created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Wallet'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       409:
   *         description: Wallet already exists for this owner + currency
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/', validate.createWallet, async (req, res, next) => {
    try {
      const { owner_id, currency } = req.body;
      const wallet = await walletService.createWallet(owner_id, currency);
      res.status(201).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/transfer:
   *   post:
   *     summary: Transfer funds
   *     description: |
   *       Atomically moves funds from one wallet to another.
   *       - Both wallets must be ACTIVE and hold the **same currency**.
   *       - Debit and credit entries are linked by a shared `reference_id`.
   *     tags: [Transactions]
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKey'
   *     requestBody:
   *       $ref: '#/components/requestBodies/TransferRequest'
   *     responses:
   *       200:
   *         description: Transfer successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     from_wallet:
   *                       $ref: '#/components/schemas/Wallet'
   *                     to_wallet:
   *                       $ref: '#/components/schemas/Wallet'
   *                     debit_entry:
   *                       $ref: '#/components/schemas/LedgerEntry'
   *                     credit_entry:
   *                       $ref: '#/components/schemas/LedgerEntry'
   *       400:
   *         description: Validation error, insufficient funds, or currency mismatch
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         $ref: '#/components/responses/Suspended'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post('/transfer', validate.transfer, async (req, res, next) => {
    try {
      const { from_wallet_id, to_wallet_id, amount, description } = req.body;
      const result = await walletService.transfer(from_wallet_id, to_wallet_id, amount, description);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/owner/{ownerId}:
   *   get:
   *     summary: List wallets by owner
   *     description: Returns all wallets belonging to the specified owner, ordered by creation time.
   *     tags: [Wallets]
   *     parameters:
   *       - in: path
   *         name: ownerId
   *         required: true
   *         schema:
   *           type: string
   *         example: user1
   *     responses:
   *       200:
   *         description: List of wallets
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Wallet'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   */
  router.get('/owner/:ownerId', validate.ownerId, async (req, res, next) => {
    try {
      const wallets = await walletService.getWalletsByOwner(req.params.ownerId);
      res.status(200).json({ success: true, data: wallets });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/{id}/topup:
   *   post:
   *     summary: Top-up wallet
   *     description: |
   *       Adds funds to a wallet.
   *       - Amount is rounded to 2 decimal places (ROUND_HALF_UP). E.g. `12.345` → `12.35`
   *       - Minimum amount: `0.01`
   *       - Wallet must be ACTIVE
   *     tags: [Transactions]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - $ref: '#/components/parameters/IdempotencyKey'
   *     requestBody:
   *       $ref: '#/components/requestBodies/TopupRequest'
   *     responses:
   *       200:
   *         description: Top-up successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     wallet:
   *                       $ref: '#/components/schemas/Wallet'
   *                     ledger_entry:
   *                       $ref: '#/components/schemas/LedgerEntry'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       403:
   *         $ref: '#/components/responses/Suspended'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post('/:id/topup', validate.topUp, async (req, res, next) => {
    try {
      const { amount, description } = req.body;
      const result = await walletService.topUp(req.params.id, amount, description);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/{id}/pay:
   *   post:
   *     summary: Pay from wallet
   *     description: |
   *       Deducts funds from a wallet.
   *       - Balance cannot go negative
   *       - Wallet must be ACTIVE
   *     tags: [Transactions]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - $ref: '#/components/parameters/IdempotencyKey'
   *     requestBody:
   *       $ref: '#/components/requestBodies/PayRequest'
   *     responses:
   *       200:
   *         description: Payment successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     wallet:
   *                       $ref: '#/components/schemas/Wallet'
   *                     ledger_entry:
   *                       $ref: '#/components/schemas/LedgerEntry'
   *       400:
   *         $ref: '#/components/responses/InsufficientFunds'
   *       403:
   *         $ref: '#/components/responses/Suspended'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post('/:id/pay', validate.pay, async (req, res, next) => {
    try {
      const { amount, description } = req.body;
      const result = await walletService.pay(req.params.id, amount, description);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/{id}/suspend:
   *   post:
   *     summary: Suspend a wallet
   *     description: Suspends a wallet, blocking all top-up, payment, and transfer operations. Idempotent — suspending an already-suspended wallet is a no-op.
   *     tags: [Wallets]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Wallet suspended (or was already suspended)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Wallet'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post('/:id/suspend', validate.walletId, async (req, res, next) => {
    try {
      const wallet = await walletService.suspendWallet(req.params.id);
      res.status(200).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/{id}:
   *   get:
   *     summary: Get wallet status
   *     description: |
   *       Returns wallet details including balance and status.
   *       Also performs an integrity check: `ledger_consistent` is `true` when
   *       `balance === SUM(ledger entries)`.
   *     tags: [Wallets]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Wallet details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/WalletWithConsistency'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.get('/:id', validate.walletId, async (req, res, next) => {
    try {
      const wallet = await walletService.getWallet(req.params.id);
      res.status(200).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  /**
   * @openapi
   * /api/wallets/{id}/ledger:
   *   get:
   *     summary: Get ledger entries
   *     description: |
   *       Returns paginated ledger entries for a wallet, ordered by time ascending.
   *       Entries are append-only — they are never modified after creation.
   *     tags: [Ledger]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 200
   *           default: 50
   *     responses:
   *       200:
   *         description: Paginated ledger entries
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     entries:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/LedgerEntry'
   *                     pagination:
   *                       $ref: '#/components/schemas/Pagination'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.get('/:id/ledger', validate.ledgerQuery, async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const result = await walletService.getWalletLedger(req.params.id, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
