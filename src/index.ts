// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBearerHandler, WebApi } from "azure-devops-node-api";
import express, { Request, Response } from "express";
import cors from "cors";

import { createAuthenticator } from "./auth.js";
import { logger } from "./logger.js";
import { getOrgTenant } from "./org-tenants.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------
const orgName: string = process.env.ADO_ORG ?? "";
if (!orgName) {
  logger.error("Environment variable ADO_ORG is required");
  process.exit(1);
}

const orgUrl = `https://dev.azure.com/${orgName}`;
const port = parseInt(process.env.PORT || "3000", 10);
const defaultDomains = "core,repositories,search";
const domainsManager = new DomainsManager(process.env.ADO_DOMAINS?.split(",") ?? defaultDomains.split(","));
const enabledDomains = domainsManager.getEnabledDomains();

// ---------------------------------------------------------------------------
// Azure DevOps client factory
// ---------------------------------------------------------------------------
function getAzureDevOpsClient(
  getToken: () => Promise<string>,
  userAgentComposer: UserAgentComposer,
): () => Promise<WebApi> {
  return async () => {
    const accessToken = await getToken();
    const authHandler = getBearerHandler(accessToken);
    return new WebApi(orgUrl, authHandler, undefined, {
      productName: "RSM.AzureDevOps.MCP.Readonly",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
  };
}

// ---------------------------------------------------------------------------
// MCP server factory – one server instance per session
// ---------------------------------------------------------------------------
function createMcpServer(authenticator: () => Promise<string>, userAgentComposer: UserAgentComposer): McpServer {
  const server = new McpServer({
    name: "RSM Azure DevOps MCP Server (Read-Only)",
    version: packageVersion,
  });

  server.server.oninitialized = () => {
    userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
  };

  configureAllTools(
    server,
    authenticator,
    getAzureDevOpsClient(authenticator, userAgentComposer),
    () => userAgentComposer.userAgent,
    enabledDomains,
    orgName,
  );

  return server;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
const transports = new Map<string, StreamableHTTPServerTransport>();

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------
async function main() {
  const tenantId = (await getOrgTenant(orgName)) ?? process.env.ADO_TENANT_ID;
  const authenticator = createAuthenticator();

  const userAgentComposer = new UserAgentComposer(packageVersion);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── Health probes ────────────────────────────────────────────────────
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "healthy" });
  });

  app.get("/readyz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ready" });
  });

  // ── MCP endpoint (POST) – handles JSON-RPC requests ──────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // New session – create transport and MCP server
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            transports.set(newSessionId, transport!);
            logger.info("MCP session created", { sessionId: newSessionId });
          },
        });

        transport.onclose = () => {
          const sid = [...transports.entries()].find(([, t]) => t === transport)?.[0];
          if (sid) {
            transports.delete(sid);
            logger.info("MCP session closed", { sessionId: sid });
          }
        };

        const server = createMcpServer(authenticator, userAgentComposer);
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
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
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).json({ error: "No active session. Send an initialize request first." });
      return;
    }

    await transport.handleRequest(req, res);
  });

  // ── MCP endpoint (DELETE) – session teardown ─────────────────────────
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).json({ error: "No active session." });
      return;
    }

    await transport.handleRequest(req, res);
  });

  // ── Start listening ──────────────────────────────────────────────────
  const httpServer = app.listen(port, () => {
    logger.info("RSM Azure DevOps MCP Server started", {
      organization: orgName,
      organizationUrl: orgUrl,
      port,
      enabledDomains: Array.from(enabledDomains),
      version: packageVersion,
      tenantId: tenantId ?? "auto-detected or not set",
    });
  });

  // ── Graceful shutdown ────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Close all active transports
    for (const [sid, transport] of transports) {
      try {
        await transport.close();
        logger.info("Closed MCP session", { sessionId: sid });
      } catch (err) {
        logger.error("Error closing MCP session", { sessionId: sid, error: err });
      }
    }
    transports.clear();

    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force exit after 10 seconds
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
