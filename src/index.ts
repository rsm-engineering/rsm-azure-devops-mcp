// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBearerHandler, WebApi } from "azure-devops-node-api";
import express, { Request, Response } from "express";
import cors from "cors";

import { createSessionAuthenticator } from "./auth.js";
import { mcpAuthMiddleware } from "./auth/middleware.js";
import { getUserByEmail } from "./auth/keyvault-store.js";
import type { SessionContext, UserConfig } from "./auth/types.js";
import { adminRouter } from "./admin/routes.js";
import { logger } from "./logger.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || "3000", 10);

// ---------------------------------------------------------------------------
// Azure DevOps client factory (per-session, uses stored URL from Key Vault)
// ---------------------------------------------------------------------------
function createConnectionProvider(
  userConfig: UserConfig,
  userAgentComposer: UserAgentComposer,
): () => Promise<WebApi> {
  const authenticator = createSessionAuthenticator(userConfig.pat);
  return async () => {
    const accessToken = await authenticator();
    const authHandler = getBearerHandler(accessToken);
    return new WebApi(userConfig.url, authHandler, undefined, {
      productName: "RSM.AzureDevOps.MCP.Readonly",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
  };
}

// ---------------------------------------------------------------------------
// MCP server factory – one per session, scoped to user credentials
// ---------------------------------------------------------------------------
function createMcpServer(
  userConfig: UserConfig,
  userAgentComposer: UserAgentComposer,
): McpServer {
  const server = new McpServer({
    name: "RSM Azure DevOps MCP Server (Read-Only)",
    version: packageVersion,
  });

  server.server.oninitialized = () => {
    userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
  };

  const authenticator = createSessionAuthenticator(userConfig.pat);
  const connectionProvider = createConnectionProvider(userConfig, userAgentComposer);
  const domainsManager = new DomainsManager(userConfig.domains?.split(","));
  const enabledDomains = domainsManager.getEnabledDomains();

  configureAllTools(
    server,
    authenticator,
    connectionProvider,
    () => userAgentComposer.userAgent,
    enabledDomains,
    userConfig.org,
  );

  return server;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
const sessions = new Map<string, SessionContext>();

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------
async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── Health probes (unauthenticated) ─────────────────────────────────
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "healthy" });
  });

  app.get("/readyz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ready" });
  });

  // ── Admin routes (/admin/*) — protected by ADMIN_API_KEY ────────────
  app.use("/admin", adminRouter);

  // ── MCP auth middleware for /mcp routes ──────────────────────────────
  app.use("/mcp", mcpAuthMiddleware());

  // ── MCP endpoint (POST) – handles JSON-RPC requests ─────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let session = sessionId ? sessions.get(sessionId) : undefined;

      // Verify session ownership — prevent cross-user session access
      if (session && req.authenticatedUser?.email.toLowerCase() !== session.userEmail) {
        res.status(403).json({ error: "Session belongs to another user." });
        return;
      }

      if (!session) {
        // New session — look up user in Key Vault
        const user = req.authenticatedUser;
        if (!user) {
          res.status(401).json({ error: "Authentication required." });
          return;
        }

        const userConfig = await getUserByEmail(user.email);
        if (!userConfig) {
          res.status(403).json({
            error: `User '${user.email}' is not registered. Contact an admin.`,
          });
          return;
        }

        const userAgentComposer = new UserAgentComposer(packageVersion);

        // Declare server first so it's available in the onsessioninitialized callback
        let server: McpServer;

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            sessions.set(newSessionId, {
              transport,
              server,
              userConfig,
              userEmail: user.email,
              createdAt: new Date(),
            });
            logger.info("MCP session created", {
              sessionId: newSessionId,
              email: user.email,
              org: userConfig.org,
              authMethod: user.authMethod,
            });
          },
        });

        transport.onclose = () => {
          const sid = [...sessions.entries()].find(([, s]) => s.transport === transport)?.[0];
          if (sid) {
            sessions.delete(sid);
            logger.info("MCP session closed", { sessionId: sid, email: user.email });
          }
        };

        server = createMcpServer(userConfig, userAgentComposer);
        await server.connect(transport);

        // Temporary session reference for this initial request (before session ID is assigned)
        session = { transport, server, userConfig, userEmail: user.email, createdAt: new Date() };
      }

      await session.transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error("Error handling MCP POST request", { error: err });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // ── MCP endpoint (GET) – SSE stream for server-to-client notifications
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      res.status(400).json({ error: "No active session. Send an initialize request first." });
      return;
    }

    if (req.authenticatedUser?.email.toLowerCase() !== session.userEmail) {
      res.status(403).json({ error: "Session belongs to another user." });
      return;
    }

    await session.transport.handleRequest(req, res);
  });

  // ── MCP endpoint (DELETE) – session teardown ────────────────────────
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      res.status(400).json({ error: "No active session." });
      return;
    }

    if (req.authenticatedUser?.email.toLowerCase() !== session.userEmail) {
      res.status(403).json({ error: "Session belongs to another user." });
      return;
    }

    await session.transport.handleRequest(req, res);
  });

  // ── Start listening ─────────────────────────────────────────────────
  const httpServer = app.listen(port, () => {
    logger.info("RSM Azure DevOps MCP Server started (multi-tenant)", {
      port,
      version: packageVersion,
      keyVault: process.env["AZURE_KEYVAULT_URL"] ?? "not set",
      aadConfigured: !!(process.env["AAD_TENANT_ID"] && process.env["AAD_CLIENT_ID"]),
    });
  });

  // ── Graceful shutdown ───────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    for (const [sid, session] of sessions) {
      try {
        await session.transport.close();
        logger.info("Closed MCP session", { sessionId: sid });
      } catch (err) {
        logger.error("Error closing MCP session", { sessionId: sid, error: err });
      }
    }
    sessions.clear();

    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});
