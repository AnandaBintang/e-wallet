import { AppError } from '../utils/errors.js';

/**
 * Global error handler middleware.
 * Maps custom AppError instances to structured JSON responses.
 * @type {import('express').ErrorRequestHandler}
 */
export default function errorHandler(err, req, res, _next) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${err.name}: ${err.message}`);
    if (!(err instanceof AppError)) {
      console.error(err.stack);
    }
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // PostgreSQL unique constraint violation
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_ENTRY', message: 'A resource with the given identifier already exists' },
    });
  }

  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      error: { code: 'CONSTRAINT_VIOLATION', message: 'Request violates data constraints' },
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    },
  });
}
