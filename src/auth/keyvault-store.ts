// Copyright (c) RSM Engineering.

import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import crypto from "node:crypto";

import { logger } from "../logger.js";
import type { UserConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Key Vault client
// ---------------------------------------------------------------------------
const vaultUrl = process.env["AZURE_KEYVAULT_URL"];
let client: SecretClient | undefined;

function getClient(): SecretClient {
  if (!client) {
    if (!vaultUrl) {
      throw new Error("Environment variable 'AZURE_KEYVAULT_URL' is required.");
    }
    client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }
  return client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize an email into a valid Key Vault secret name (alphanumeric + hyphens). */
function emailToSecretName(email: string): string {
  return "user-" + email.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

/** Generate a prefixed API key. */
export function generateApiKey(): string {
  return "rsmk_" + crypto.randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// In-memory cache (5 min TTL)
// ---------------------------------------------------------------------------
interface CacheEntry {
  config: UserConfig;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const emailCache = new Map<string, CacheEntry>();
const apiKeyCache = new Map<string, CacheEntry>();

function cacheUser(config: UserConfig): void {
  const entry: CacheEntry = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  emailCache.set(config.email.toLowerCase(), entry);
  apiKeyCache.set(config.apiKey, entry);
}

function evictUser(email: string): void {
  const normalised = email.toLowerCase();
  const entry = emailCache.get(normalised);
  if (entry) {
    apiKeyCache.delete(entry.config.apiKey);
    emailCache.delete(normalised);
  }
}

function getCached<K>(map: Map<K, CacheEntry>, key: K): UserConfig | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.config;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getUserByEmail(email: string): Promise<UserConfig | undefined> {
  const normalised = email.toLowerCase();
  const cached = getCached(emailCache, normalised);
  if (cached) return cached;

  try {
    const secret = await getClient().getSecret(emailToSecretName(normalised));
    if (!secret.value) return undefined;
    const config: UserConfig = JSON.parse(secret.value);
    cacheUser(config);
    return config;
  } catch (err: any) {
    if (err.statusCode === 404) return undefined;
    logger.error("Key Vault getUserByEmail error", { email, error: err.message });
    throw err;
  }
}

export async function getUserByApiKey(apiKey: string): Promise<UserConfig | undefined> {
  const cached = getCached(apiKeyCache, apiKey);
  if (cached) return cached;

  // API key not in cache — scan all user secrets
  try {
    const kv = getClient();
    for await (const props of kv.listPropertiesOfSecrets()) {
      if (!props.name.startsWith("user-") || !props.enabled) continue;
      const secret = await kv.getSecret(props.name);
      if (!secret.value) continue;
      try {
        const config: UserConfig = JSON.parse(secret.value);
        cacheUser(config);
        if (config.apiKey === apiKey) return config;
      } catch {
        // Skip malformed secrets
      }
    }
  } catch (err: any) {
    logger.error("Key Vault getUserByApiKey scan error", { error: err.message });
    throw err;
  }
  return undefined;
}

export async function setUser(config: UserConfig): Promise<void> {
  const kv = getClient();
  const secretName = emailToSecretName(config.email);
  await kv.setSecret(secretName, JSON.stringify(config));
  cacheUser(config);
  logger.info("Saved user config to Key Vault", { email: config.email, org: config.org });
}

export async function deleteUser(email: string): Promise<void> {
  const kv = getClient();
  const secretName = emailToSecretName(email);
  evictUser(email);
  await kv.beginDeleteSecret(secretName);
  logger.info("Deleted user config from Key Vault", { email });
}

export async function listUsers(): Promise<Omit<UserConfig, "pat" | "apiKey">[]> {
  const kv = getClient();
  const users: Omit<UserConfig, "pat" | "apiKey">[] = [];

  for await (const props of kv.listPropertiesOfSecrets()) {
    if (!props.name.startsWith("user-") || !props.enabled) continue;
    try {
      const secret = await kv.getSecret(props.name);
      if (!secret.value) continue;
      const config: UserConfig = JSON.parse(secret.value);
      cacheUser(config);
      const { pat: _p, apiKey: _a, ...safe } = config;
      users.push(safe);
    } catch {
      // Skip malformed secrets
    }
  }
  return users;
}
