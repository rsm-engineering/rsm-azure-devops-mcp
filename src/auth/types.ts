// Copyright (c) RSM Engineering.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * User configuration stored as a JSON secret in Azure Key Vault.
 * Each registered user has one secret: `user-{sanitized-email}`.
 */
export interface UserConfig {
  email: string;
  /** Azure DevOps organization name (e.g. "HunterStewart") */
  org: string;
  /** Full Azure DevOps organization URL (e.g. "https://dev.azure.com/HunterStewart") */
  url: string;
  /** Personal Access Token */
  pat: string;
  /** Comma-separated domain list (e.g. "core,repositories,search") */
  domains: string;
  /** Per-user API key for MCP client auth (e.g. "rsmk_a1b2c3...") */
  apiKey: string;
  /** ISO 8601 timestamp */
  registeredAt: string;
}

/**
 * Resolved identity from auth middleware (AAD token or API key).
 */
export interface AuthenticatedUser {
  /** AAD object ID (empty string for API key auth) */
  oid: string;
  email: string;
  authMethod: "aad" | "api-key";
}

/**
 * Per-session state: transport + MCP server + user credentials.
 */
export interface SessionContext {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  userConfig: UserConfig;
  userEmail: string;
  createdAt: Date;
}
