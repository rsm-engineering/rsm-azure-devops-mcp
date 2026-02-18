// Copyright (c) RSM Engineering.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { logger } from "../logger.js";
import type { AuthenticatedUser } from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const tenantId = process.env["AAD_TENANT_ID"] ?? "";
const clientId = process.env["AAD_CLIENT_ID"] ?? "";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) {
    if (!tenantId) throw new Error("AAD_TENANT_ID is required for AAD authentication.");
    const url = new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface AadClaims extends JWTPayload {
  preferred_username?: string;
  upn?: string;
  oid?: string;
}

/**
 * Validate an AAD/Entra ID Bearer token.
 * Returns the authenticated user on success, or null if validation fails.
 */
export async function validateAadToken(token: string): Promise<AuthenticatedUser | null> {
  if (!tenantId || !clientId) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience: clientId,
    });

    const claims = payload as AadClaims;
    const email = claims.preferred_username ?? claims.upn;
    if (!email) {
      logger.warn("AAD token missing preferred_username and upn claims");
      return null;
    }

    return {
      oid: claims.oid ?? "",
      email: email.toLowerCase(),
      authMethod: "aad",
    };
  } catch (err: any) {
    logger.warn("AAD token validation failed", { error: err.message });
    return null;
  }
}

/** Returns true if AAD auth is configured (both tenant and client IDs set). */
export function isAadConfigured(): boolean {
  return !!tenantId && !!clientId;
}
