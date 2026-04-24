import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from "express-rate-limit";
import swaggerUi from 'swagger-ui-express';
import errorHandler from './middleware/errorHandler.js';
import createIdempotencyMiddleware from './middleware/idempotency.js';
import createWalletRoutes from './routes/walletRoutes.js';
import { WalletService } from './services/walletService.js';
import swaggerSpec from './config/swagger.js';

/**
 * Creates and configures the Express application.
 * @param {import('knex').Knex} knex
 * @returns {import('express').Application}
 */
export default function createApp(knex) {
  const app = express();

  // Security & Parsing
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // Rate Limiting
  if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests from this IP, please try again later.",
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use("/api", limiter);
  }

  // Logging
  if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
    app.use(morgan("dev"));
  }

  // API Docs
  if (process.env.NODE_ENV !== "test") {
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        customSiteTitle: "E-Wallet API Docs",
        swaggerOptions: { persistAuthorization: true },
      }),
    );

    app.get("/api-docs.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerSpec);
    });
  }

  // Idempotency
  app.use("/api/wallets", createIdempotencyMiddleware(knex));

  // Routes
  const walletService = new WalletService(knex);
  app.use("/api/wallets", createWalletRoutes(walletService));

  // Health check
  app.get("/health", async (_req, res) => {
    try {
      await knex.raw("SELECT 1");
      res.json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected" });
    }
  });

  // 404
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found",
      },
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
