// Copyright (c) RSM Engineering.

import { Router, type Request, type Response, type NextFunction } from "express";
import { logger } from "../logger.js";
import {
  getUserByEmail,
  setUser,
  deleteUser,
  listUsers,
  generateApiKey,
} from "../auth/keyvault-store.js";
import type { UserConfig } from "../auth/types.js";

// ---------------------------------------------------------------------------
// Admin API key guard
// ---------------------------------------------------------------------------
const adminApiKey = process.env["ADMIN_API_KEY"];

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!adminApiKey) {
    res.status(503).json({ error: "Admin API not configured (ADMIN_API_KEY not set)." });
    return;
  }
  if (req.headers["x-api-key"] !== adminApiKey) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const adminRouter = Router();
adminRouter.use(adminAuth);

/**
 * POST /admin/users
 * Body: { email, org, url, pat, domains? }
 * Returns: 201 + full config (including generated API key)
 */
adminRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const { email, org, url, pat, domains } = req.body as {
      email?: string;
      org?: string;
      url?: string;
      pat?: string;
      domains?: string;
    };

    if (!email || !org || !url || !pat) {
      res.status(400).json({ error: "Fields 'email', 'org', 'url', and 'pat' are required." });
      return;
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: `User '${email}' already exists. Delete first or rotate key.` });
      return;
    }

    const config: UserConfig = {
      email: email.toLowerCase(),
      org,
      url,
      pat,
      domains: domains ?? "core,repositories,search",
      apiKey: generateApiKey(),
      registeredAt: new Date().toISOString(),
    };

    await setUser(config);
    logger.info("Admin: registered user", { email: config.email, org: config.org });

    res.status(201).json({
      email: config.email,
      org: config.org,
      url: config.url,
      domains: config.domains,
      apiKey: config.apiKey,
      registeredAt: config.registeredAt,
    });
  } catch (err: any) {
    logger.error("Admin: POST /users error", { error: err.message });
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * GET /admin/users
 * Returns: list of users (no PATs or API keys)
 */
adminRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err: any) {
    logger.error("Admin: GET /users error", { error: err.message });
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * DELETE /admin/users/:email
 * Returns: 204
 */
adminRouter.delete("/users/:email", async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const existing = await getUserByEmail(email);
    if (!existing) {
      res.status(404).json({ error: `User '${email}' not found.` });
      return;
    }
    await deleteUser(email);
    logger.info("Admin: deleted user", { email });
    res.status(204).send();
  } catch (err: any) {
    logger.error("Admin: DELETE /users error", { error: err.message });
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /admin/users/:email/rotate-key
 * Returns: 200 + new API key
 */
adminRouter.post("/users/:email/rotate-key", async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const existing = await getUserByEmail(email);
    if (!existing) {
      res.status(404).json({ error: `User '${email}' not found.` });
      return;
    }

    const updated: UserConfig = { ...existing, apiKey: generateApiKey() };
    await setUser(updated);
    logger.info("Admin: rotated API key", { email });
    res.json({ email: updated.email, apiKey: updated.apiKey });
  } catch (err: any) {
    logger.error("Admin: rotate-key error", { error: err.message });
    res.status(500).json({ error: "Internal server error." });
  }
});
