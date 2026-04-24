/**
 * Idempotency middleware — prevents duplicate request processing.
 *
 * When a client sends an `Idempotency-Key` header:
 * 1. If the key was seen before, return the cached response without re-executing.
 * 2. If the key is new, execute the handler and cache the response.
 *
 * @param {import('knex').Knex} knex
 * @returns {import('express').RequestHandler}
 */
export default function createIdempotencyMiddleware(knex) {
  return async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) return next();

    try {
      const existing = await knex('idempotency_keys')
        .select('response_code', 'response_body')
        .where('idempotency_key', idempotencyKey)
        .first();

      if (existing) {
        res.setHeader('X-Idempotent-Replayed', 'true');
        return res.status(existing.response_code).json(JSON.parse(existing.response_body));
      }

      // Intercept res.json to cache the response before sending
      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        try {
          await knex('idempotency_keys')
            .insert({
              idempotency_key: idempotencyKey,
              response_code: res.statusCode,
              response_body: JSON.stringify(body),
            })
            .onConflict('idempotency_key')
            .ignore();
        } catch (err) {
          console.error('[IDEMPOTENCY] Failed to store key:', err.message);
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('[IDEMPOTENCY] Check failed:', err.message);
      next();
    }
  };
}
