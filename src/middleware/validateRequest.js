import { body, param, query, validationResult } from 'express-validator';

/**
 * Middleware to check for validation errors from express-validator.
 * @type {import('express').RequestHandler}
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  next();
}

/** Reusable amount validator */
const amountChain = () =>
  body('amount')
    .notEmpty().withMessage('amount is required')
    .custom((value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('amount must be a number or numeric string');
      }
      if (isNaN(Number(value))) throw new Error('amount must be a valid number');
      return true;
    });

/** Reusable optional description validator */
const descriptionChain = () =>
  body('description').optional().isString().withMessage('description must be a string');

/**
 * Validation chains for each endpoint.
 */
const validate = {
  createWallet: [
    body('owner_id').trim().notEmpty().withMessage('owner_id is required').isString(),
    body('currency')
      .trim().notEmpty().withMessage('currency is required')
      .isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter ISO code')
      .isAlpha().withMessage('currency must contain only letters'),
    handleValidationErrors,
  ],

  topUp: [
    param('id').trim().notEmpty().withMessage('Wallet ID is required'),
    amountChain(),
    descriptionChain(),
    handleValidationErrors,
  ],

  pay: [
    param('id').trim().notEmpty().withMessage('Wallet ID is required'),
    amountChain(),
    descriptionChain(),
    handleValidationErrors,
  ],

  transfer: [
    body('from_wallet_id').trim().notEmpty().withMessage('from_wallet_id is required'),
    body('to_wallet_id').trim().notEmpty().withMessage('to_wallet_id is required'),
    amountChain(),
    descriptionChain(),
    handleValidationErrors,
  ],

  walletId: [
    param('id').trim().notEmpty().withMessage('Wallet ID is required'),
    handleValidationErrors,
  ],

  ownerId: [
    param('ownerId').trim().notEmpty().withMessage('Owner ID is required'),
    handleValidationErrors,
  ],

  ledgerQuery: [
    param('id').trim().notEmpty().withMessage('Wallet ID is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200'),
    handleValidationErrors,
  ],
};

export default validate;
