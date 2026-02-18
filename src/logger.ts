// Copyright (c) RSM Engineering.
// Based on Microsoft Corporation's azure-devops-mcp, licensed under MIT.

import winston from "winston";

/**
 * Logger utility for the read-only MCP HTTP server.
 * Logs to stdout (Console transport) for standard container log capture.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
