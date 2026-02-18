// Copyright (c) RSM Engineering.

import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { validateAadToken, isAadConfigured } from "./aad-validator.js";
import { getUserByApiKey } from "./keyvault-store.js";
import type { AuthenticatedUser } from "./types.js";

// ---------------------------------------------------------------------------
// Extend Express Request
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that authenticates requests via:
 * 1. `Authorization: Bearer <AAD-token>` (if AAD is configured)
 * 2. `x-api-key: <per-user-api-key>` (Key Vault lookup)
 *
 * On success, sets `req.authenticatedUser`. On failure, returns 401.
 */
export function mcpAuthMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // --- Try Bearer token (AAD) ---
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (isAadConfigured()) {
        const user = await validateAadToken(token);
        if (user) {
          req.authenticatedUser = user;
          return next();
        }
      }
      // Bearer present but invalid — don't fall through to API key
      res.status(401).json({ error: "Invalid or expired AAD token." });
      return;
    }

    // --- Try x-api-key ---
    const apiKey = req.headers["x-api-key"] as string | undefined;
    if (apiKey) {
      try {
        const userConfig = await getUserByApiKey(apiKey);
        if (userConfig) {
          req.authenticatedUser = {
            oid: "",
            email: userConfig.email.toLowerCase(),
            authMethod: "api-key",
          };
          return next();
        }
      } catch (err: any) {
        logger.error("API key lookup error", { error: err.message });
        res.status(500).json({ error: "Authentication service unavailable." });
        return;
      }

      res.status(401).json({ error: "Invalid API key." });
      return;
    }

    // --- No credentials ---
    res.status(401).json({ error: "Authentication required. Provide an AAD Bearer token or x-api-key header." });
  };
}
