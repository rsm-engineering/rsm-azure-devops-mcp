// Copyright (c) RSM Engineering.

/**
 * Creates a per-session PAT authenticator from a known token.
 */
export function createSessionAuthenticator(pat: string): () => Promise<string> {
  return async () => pat;
}
