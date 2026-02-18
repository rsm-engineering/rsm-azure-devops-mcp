// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

import { logger } from "./logger.js";

/**
 * Creates a PAT token authenticator for container deployment.
 * Reads the token from the ADO_MCP_AUTH_TOKEN environment variable.
 */
function createAuthenticator(): () => Promise<string> {
  const token = process.env["ADO_MCP_AUTH_TOKEN"];
  if (!token) {
    throw new Error(
      "Environment variable 'ADO_MCP_AUTH_TOKEN' is required. " +
        "Set it with a valid Azure DevOps Personal Access Token.",
    );
  }
  logger.info("Using PAT token authentication (ADO_MCP_AUTH_TOKEN)");
  return async () => {
    return token;
  };
}

export { createAuthenticator };
