# RSM Azure DevOps MCP Server (Read-Only, Multi-Tenant)

A containerized, read-only [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for Azure DevOps, designed for multi-tenant deployment on Azure Container Apps. Based on [Microsoft's azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp), stripped down to read-only operations and re-architected for shared container deployment.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Supported Tools](#supported-tools)
4. [Quick Start](#quick-start)
5. [Deployment](#deployment)
6. [User Management](#user-management)
7. [Client Configuration](#client-configuration)
8. [Using Domains](#using-domains)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)

## Overview

This server exposes Azure DevOps read-only operations (projects, repos, branches, pull requests, commits, search, work item search) as MCP tools over Streamable HTTP transport. A single container serves multiple users, each authenticated with their own credentials stored in Azure Key Vault.

Key design principles:

- **Read-only**: No write operations. Safe for broad access.
- **Multi-tenant**: One container, many users. Each session is scoped to a user's own Azure DevOps org, URL, and PAT.
- **Zero per-user infrastructure**: No need to spin up/down containers per user or org. User credentials are managed via an admin API.
- **Secure**: AAD/Entra ID JWT validation or per-user API keys. Session ownership enforced on every request.

## Architecture

```
Claude Desktop / MCP Clients
  |  (x-api-key or Bearer AAD token)
  v
+----------------------------------+
|  Single Azure Container App      |
|  +----------------------------+  |
|  | Auth Middleware             |  |  Validates AAD JWT or API key
|  |   |                        |  |
|  | Key Vault Lookup (cached)  |  |  Gets user's org + URL + PAT
|  |   |                        |  |
|  | Per-Session MCP Server     |  |  Closures scoped to user creds
|  +----------------------------+  |
|                                  |
|  /admin/users  (CRUD, AAD-only)  |  Admin registers users -> Key Vault
|  /healthz, /readyz               |  Health probes
+----------------+-----------------+
                 |
                 v
         Azure Key Vault
         (user configs as JSON secrets)
```

### How sessions work

1. Client sends `POST /mcp` with `x-api-key` (or `Authorization: Bearer <AAD-token>`)
2. Auth middleware resolves user identity
3. Key Vault lookup returns `UserConfig` (org, URL, PAT, domains)
4. A per-session MCP server is created with closures scoped to that user's credentials
5. Subsequent requests include `mcp-session-id` header to reuse the session
6. Session ownership is verified on every request (POST, GET, DELETE)

## Supported Tools

This server exposes **read-only** tools from three domains:

| Domain | Tools | Description |
|--------|-------|-------------|
| **Core** | `core_list_projects`, `core_list_project_teams`, `core_get_identity_ids` | List projects, teams, and identities |
| **Repositories** | `repo_list_repos_by_project`, `repo_get_repo_by_name_or_id`, `repo_list_branches_by_repo`, `repo_get_branch_by_name`, `repo_search_commits`, `repo_list_pull_requests_by_repo_or_project`, `repo_list_pull_requests_by_assigned_to`, `repo_get_pull_request_by_id`, `repo_list_pull_request_threads`, `repo_list_pull_request_thread_comments`, `repo_list_pull_requests_by_commits`, `repo_list_my_branches_by_repo` | Browse repos, branches, PRs, commits |
| **Search** | `search_code`, `search_wiki`, `search_workitem` | Search code, wiki, and work items |

See [docs/TOOLSET.md](./docs/TOOLSET.md) for detailed parameter documentation per tool.

## Quick Start

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`)
- An Azure subscription with permissions to create: Resource Group, ACR, Key Vault, Container Apps
- An Azure DevOps PAT with read access for each user

### Deploy

```bash
# Set required env vars
export AAD_TENANT_ID="your-aad-tenant-id"
export AAD_CLIENT_ID="your-aad-app-client-id"
export ADMIN_EMAILS="admin@example.com"           # Comma-separated admin emails
export AZURE_SUBSCRIPTION_ID="your-subscription-id"

# Run the deployment
bash deploy/deploy.sh
```

This creates: Resource Group, ACR, Key Vault, Container App Environment, Container App with Managed Identity, and RBAC for Key Vault access.

### Register a user

Admin operations require an AAD Bearer token from an email in the `ADMIN_EMAILS` list:

```bash
TOKEN=$(az account get-access-token --resource $AAD_CLIENT_ID --query accessToken -o tsv)

curl -X POST https://<FQDN>/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "org": "MyOrg",
    "url": "https://dev.azure.com/MyOrg",
    "pat": "<ADO_PAT>"
  }'
# Returns: { "apiKey": "rsmk_..." }
```

### Connect from Claude Desktop

```json
{
  "mcpServers": {
    "azure-devops": {
      "type": "streamableHttp",
      "url": "https://<FQDN>/mcp",
      "headers": {
        "x-api-key": "rsmk_..."
      }
    }
  }
}
```

See the [Getting Started guide](./docs/GETTINGSTARTED.md) for full deployment details and more client configurations.

## Deployment

See [deploy/](./deploy/) for scripts:

| Script | Purpose |
|--------|---------|
| `deploy/deploy.sh` | Full deployment (RG, ACR, Key Vault, Container App, RBAC) |
| `deploy/rebuild.sh` | Rebuild Docker image and restart Container App |
| `deploy/config.sh` | Shared configuration (resource names, sizing) |

### Environment Variables

The Container App uses these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_KEYVAULT_URL` | Yes | Key Vault URL (e.g., `https://kv-rsm-ado-mcp.vault.azure.net/`) |
| `AAD_TENANT_ID` | Yes | Azure AD tenant ID for authentication |
| `AAD_CLIENT_ID` | Yes | Azure AD app registration client ID |
| `ADMIN_EMAILS` | Yes | Comma-separated list of admin email addresses (AAD-authenticated) |
| `PORT` | No | Server port (default: `3000`) |
| `LOG_LEVEL` | No | Logging level: `error`, `warn`, `info`, `debug` (default: `info`) |

## User Management

The admin API requires AAD authentication. Only users whose email appears in the `ADMIN_EMAILS` environment variable can access these endpoints (via `Authorization: Bearer <AAD-token>` header).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/users` | Register a user (returns generated API key) |
| `GET` | `/admin/users` | List all users (no PATs/keys exposed) |
| `DELETE` | `/admin/users/:email` | Remove a user |
| `POST` | `/admin/users/:email/rotate-key` | Rotate a user's API key |

### Registration payload

```json
{
  "email": "user@example.com",
  "org": "MyOrg",
  "url": "https://dev.azure.com/MyOrg",
  "pat": "<PERSONAL_ACCESS_TOKEN>",
  "domains": "core,repositories,search"
}
```

The `domains` field is optional and defaults to `core,repositories,search`.

## Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "azure-devops": {
      "type": "streamableHttp",
      "url": "https://<FQDN>/mcp",
      "headers": {
        "x-api-key": "rsmk_..."
      }
    }
  }
}
```

### VS Code (MCP extension)

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "azure-devops": {
      "type": "streamableHttp",
      "url": "https://<FQDN>/mcp",
      "headers": {
        "x-api-key": "rsmk_..."
      }
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add azure-devops \
  --transport streamable-http \
  "https://<FQDN>/mcp" \
  --header "x-api-key: rsmk_..."
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "azure-devops": {
      "type": "streamableHttp",
      "url": "https://<FQDN>/mcp",
      "headers": {
        "x-api-key": "rsmk_..."
      }
    }
  }
}
```

## Using Domains

Each user can be registered with specific domains to limit which tools are available in their sessions. Domains are set during user registration via the `domains` field (comma-separated).

Available domains: `core`, `repositories`, `search`

By default, all three domains are enabled.

## Security

### Authentication methods

| Method | Header | Use Case |
|--------|--------|----------|
| **API Key** | `x-api-key: rsmk_...` | Claude Desktop and other MCP clients that don't support OAuth |
| **AAD/Entra ID** | `Authorization: Bearer <token>` | Enterprise SSO (requires `AAD_TENANT_ID` and `AAD_CLIENT_ID` configured) |

If a `Bearer` token is present but invalid, the server returns 401 immediately (does not fall back to API key).

### Session isolation

- Each session is scoped to the authenticated user's credentials
- Session ownership is verified on every request (POST, GET, DELETE)
- One user cannot access another user's session, even with the session ID
- User configs are cached in-memory for 5 minutes, then refreshed from Key Vault

### Key Vault security

- Container App uses system-assigned Managed Identity
- Managed Identity has "Key Vault Secrets Officer" role
- User configs stored as JSON secrets named `user-{sanitized-email}`
- PATs and API keys are never exposed via the admin list endpoint

### PAT scope recommendations

For read-only operations, the Azure DevOps PAT needs these scopes:

| Scope | Required For |
|-------|-------------|
| **Project and Team (Read)** | `core_list_projects`, `core_list_project_teams` |
| **Code (Read)** | All `repo_*` tools |
| **Work Items (Read)** | `search_workitem` |
| **Wiki (Read)** | `search_wiki` |

## Troubleshooting

See the [Troubleshooting guide](./docs/TROUBLESHOOTING.md) for common issues with deployment, authentication, and Key Vault.

## Contributing

See the [Contributing guide](./CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the [MIT License](./LICENSE.md).

Based on [Microsoft's azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp), licensed under MIT.
