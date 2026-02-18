# Frequently Asked Questions

## General

### What is this server?

This is a **read-only**, **multi-tenant** MCP server for Azure DevOps, deployed as a single Azure Container App. It exposes Azure DevOps read operations (projects, repos, branches, PRs, commits, search, work items) as MCP tools over Streamable HTTP transport.

### How is this different from Microsoft's azure-devops-mcp?

This is based on [Microsoft's azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp) but re-architected:

| | Microsoft's MCP Server | This Server |
|---|---|---|
| **Transport** | stdio (local process) | Streamable HTTP (remote container) |
| **Operations** | Read + Write (80+ tools) | Read-only (18 tools) |
| **Users** | Single user per instance | Multi-tenant (many users, one container) |
| **Auth** | OAuth / Azure CLI / PAT locally | API key or AAD/Entra ID JWT |
| **Credentials** | Local environment | Azure Key Vault (per-user) |
| **Deployment** | `npx` or local install | Azure Container Apps |

### Does it support Azure DevOps Server (on-premises)?

No. This server uses Azure DevOps Services REST APIs (including `almsearch.dev.azure.com` for search). On-premises deployments are not supported.

### Is this server read-only? Can I make changes to Azure DevOps through it?

Yes, it is strictly read-only. There are no write operations exposed. You cannot create, update, or delete any Azure DevOps resources through this server. This is by design for safe, broad access.

## Authentication

### How do users authenticate?

Two methods are supported for **MCP clients** (`/mcp` endpoint):

1. **API Key** (`x-api-key` header) — Generated when a user is registered via the admin API. Recommended for most MCP clients.
2. **AAD/Entra ID JWT** (`Authorization: Bearer <token>`) — For enterprise SSO. Requires `AAD_TENANT_ID` and `AAD_CLIENT_ID` environment variables on the container.

**Admin endpoints** (`/admin/*`) require AAD Bearer token authentication only. The admin user's email must be in the `ADMIN_EMAILS` environment variable.

### Are PATs used directly by clients?

No. Users never send their Azure DevOps PAT to the MCP server at request time. PATs are stored securely in Azure Key Vault during user registration. Clients authenticate with an API key (or AAD token), and the server retrieves the PAT from Key Vault internally.

### What happens if I send both a Bearer token and an API key?

The server checks for a `Bearer` token first. If present but invalid, it returns `401` immediately and does **not** fall back to the API key. If no Bearer token is present, the server checks `x-api-key`.

### Are personal Microsoft accounts supported?

Only accounts backed by Entra ID (Azure AD) are supported for AAD authentication. For API key authentication, any Azure DevOps PAT will work regardless of account type.

## Multi-Tenancy

### Can multiple users share one server instance?

Yes. That's the core design. A single container serves all registered users. Each user session is scoped to their own credentials (org, URL, PAT) stored in Key Vault.

### Can one user access another user's data?

No. Session ownership is verified on every request (POST, GET, DELETE). Even if a user somehow obtained another user's session ID, the server rejects requests where the authenticated user doesn't match the session owner.

### Can a user connect to more than one Azure DevOps organization?

Each user registration is tied to one organization. To access multiple orgs, register the same email with different org configurations (this would require separate registrations with distinct identifiers).

### How are user credentials stored?

User configurations (org, URL, PAT, API key, domains) are stored as JSON secrets in Azure Key Vault, named `user-{sanitized-email}`. The Container App accesses Key Vault via system-assigned Managed Identity.

### Is there a user limit?

There is no hard-coded user limit. The practical limit depends on your Azure Key Vault tier and Container App scaling configuration. User configs are cached in-memory for 5 minutes to minimize Key Vault calls.

## Deployment

### What Azure resources are created?

The deployment script creates:

1. Resource Group
2. Azure Container Registry (ACR) — builds the Docker image
3. Azure Key Vault — stores user configs
4. Container App Environment
5. Container App — with system-assigned Managed Identity
6. RBAC role assignment — Managed Identity gets "Key Vault Secrets Officer"

### How do I update the server after code changes?

Run `bash deploy/rebuild.sh`. This rebuilds the Docker image in ACR and restarts the Container App.

### Can I customize resource names and sizing?

Yes. Edit `deploy/config.sh` before deploying to change resource names, region, CPU/memory, and replica counts.

## Tools and Domains

### What tools are available?

18 read-only tools across three domains:

- **Core** (3 tools): List projects, list teams, get identities
- **Repositories** (12 tools): List/get repos, branches, PRs, commits, PR threads/comments
- **Search** (3 tools): Search code, wiki, and work items

See [TOOLSET.md](./TOOLSET.md) for full parameter documentation.

### Can I limit which tools a user has access to?

Yes. Set the `domains` field when registering a user (e.g., `"domains": "core,repositories"`). Only tools from enabled domains will be available in that user's sessions.

### Why are some tools from the upstream Microsoft project missing?

This server is intentionally limited to read-only operations. Write tools (create/update PRs, work items, wiki pages, pipelines, etc.) are excluded by design.
