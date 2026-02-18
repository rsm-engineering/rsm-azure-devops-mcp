# Technical Design Document (TDD)

## RSM Azure DevOps MCP Server (Read-Only)

**Version:** 1.0
**Date:** 2026-02-18
**Author:** RSM Engineering

---

## 1. Architecture Overview

```
┌─────────────────┐     HTTP/SSE      ┌───────────────────────────┐
│   MCP Client    │ ◄──────────────►  │  Express HTTP Server      │
│ (Claude, etc.)  │    /mcp endpoint   │  ┌─────────────────────┐  │
└─────────────────┘                    │  │ StreamableHTTP       │  │
                                       │  │ Transport (per       │  │
                                       │  │ session)             │  │
                                       │  └────────┬────────────┘  │
                                       │           │               │
                                       │  ┌────────▼────────────┐  │
                                       │  │ McpServer           │  │
                                       │  │ (tool registry)     │  │
                                       │  └────────┬────────────┘  │
                                       │           │               │
                                       │  ┌────────▼────────────┐  │
                                       │  │ Azure DevOps        │  │
                                       │  │ Node API + REST     │  │
                                       │  └─────────────────────┘  │
                                       └───────────────────────────┘
                                                   │
                                                   ▼
                                       ┌───────────────────────┐
                                       │ Azure DevOps Services │
                                       │ (dev.azure.com)       │
                                       └───────────────────────┘
```

## 2. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22 (Alpine) |
| Language | TypeScript | 5.9+ |
| MCP SDK | @modelcontextprotocol/sdk | 1.26.0 |
| HTTP Framework | Express | 4.21+ |
| Azure DevOps Client | azure-devops-node-api | 15.1+ |
| Logging | Winston | 3.18+ |
| Schema Validation | Zod | 3.25+ |
| Container | Docker (multi-stage) | Alpine-based |

## 3. Component Design

### 3.1 Entry Point (`src/index.ts`)

Responsibilities:
- Read environment variables (`ADO_ORG`, `ADO_MCP_AUTH_TOKEN`, `PORT`, `ADO_DOMAINS`, `LOG_LEVEL`)
- Initialize Express server with CORS
- Mount `/mcp` endpoint (POST, GET, DELETE) for MCP protocol
- Mount `/healthz` and `/readyz` for container probes
- Manage session lifecycle (create, track, destroy)
- Handle graceful shutdown (SIGTERM, SIGINT)

### 3.2 Authentication (`src/auth.ts`)

Single authentication strategy: PAT token from `ADO_MCP_AUTH_TOKEN` environment variable.

```
Environment Variable → createAuthenticator() → () => Promise<string>
```

The returned async function always resolves to the PAT token. No token refresh logic is needed as PATs are static.

### 3.3 Tool Registry (`src/tools.ts`)

Domain-gated tool registration:

```
configureAllTools(server, tokenProvider, connectionProvider, userAgentProvider, enabledDomains, orgName)
  ├── Core tools     (if "core" enabled)
  ├── Repo tools     (if "repositories" enabled)
  └── Search tools   (if "search" enabled)
```

Default enabled domains: `core`, `repositories`, `search`.

### 3.4 Transport Layer

Uses `StreamableHTTPServerTransport` from the MCP SDK. Each client session gets its own transport instance stored in an in-memory `Map<string, StreamableHTTPServerTransport>`.

**Session lifecycle:**
1. Client sends POST to `/mcp` without `mcp-session-id` header → new transport + MCP server created
2. Transport generates session ID via `crypto.randomUUID()`
3. Subsequent requests include `mcp-session-id` header → routed to existing transport
4. DELETE to `/mcp` or transport close → session removed from map

### 3.5 Logging (`src/logger.ts`)

Winston logger configured for container environments:
- **Output**: stdout (captured by container runtime)
- **Format**: JSON with timestamps and error stack traces
- **Level**: Configurable via `LOG_LEVEL` env var (default: `info`)

## 4. Tool Inventory (18 Tools)

### 4.1 Core Tools

| Tool | Description |
|---|---|
| `list_projects` | List all projects in the organization |
| `list_project_teams` | List teams in a specific project |
| `get_identity_ids` | Resolve identity IDs to names/emails |

### 4.2 Repository Tools

| Tool | Description |
|---|---|
| `list_repos_by_project` | List repositories in a project |
| `list_pull_requests_by_repo_or_project` | List PRs with optional filters (creator, reviewer, status) |
| `get_pull_request_by_id` | Get detailed PR information |
| `list_branches_by_repo` | List branches in a repository |
| `list_my_branches_by_repo` | List branches owned by the current user |
| `get_repo_by_name_or_id` | Get repository details |
| `get_branch_by_name` | Get specific branch details |
| `list_pull_request_threads` | List PR discussion threads |
| `list_pull_request_thread_comments` | List comments in a PR thread |
| `search_commits` | Search commits by criteria |
| `list_pull_requests_by_commits` | Find PRs associated with commits |
| `list_pull_requests_by_assigned_to` | **NEW** - Filter PRs by work item assignee |

### 4.3 Search Tools

| Tool | Description |
|---|---|
| `search_code` | Full-text search across code repositories |
| `search_wiki` | Search wiki pages |
| `search_workitem` | Search work items |

## 5. New Tool: `list_pull_requests_by_assigned_to`

### 5.1 Purpose

Find pull requests where a linked work item is assigned to a specific user (by email). This enables scenarios like "Show me all active PRs related to my work items."

### 5.2 Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `project` | string | Yes | - | Project name |
| `repositoryId` | string | No | - | Filter to specific repo |
| `assignedToEmail` | string | Yes | - | Email of the work item assignee |
| `status` | enum | No | Active | PR status filter (Active, Completed, Abandoned, All) |
| `top` | number | No | 50 | Maximum PRs to scan |

### 5.3 Implementation Flow

```
1. List PRs (by project or repo+project) with status filter
        │
2. For each PR → getPullRequestWorkItemRefs()
        │
3. Collect unique work item IDs across all PRs
        │
4. Batch-fetch work items with field: System.AssignedTo
        │
5. Build map: workItemId → assignedToEmail
        │
6. Filter PRs where any linked work item is assigned to target email
        │
7. Return matching PRs with linked work item details
```

### 5.4 AssignedTo Matching

The `System.AssignedTo` field can be either:
- A string (email or display name)
- An object with `uniqueName` property

The tool performs case-insensitive email matching against both formats.

## 6. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADO_ORG` | Yes | - | Azure DevOps organization name |
| `ADO_MCP_AUTH_TOKEN` | Yes | - | Personal Access Token for Azure DevOps |
| `ADO_TENANT_ID` | No | auto-detected | Azure AD tenant ID |
| `ADO_DOMAINS` | No | `core,repositories,search` | Comma-separated list of enabled domains |
| `PORT` | No | `3000` | HTTP listen port |
| `LOG_LEVEL` | No | `info` | Winston log level (error, warn, info, debug) |

## 7. Containerization

### 7.1 Multi-Stage Docker Build

```
Stage 1 (build): node:22-alpine
  → npm ci (all deps)
  → tsc compile

Stage 2 (production): node:22-alpine
  → npm ci --omit=dev (prod deps only)
  → Copy dist/ from build stage
  → Non-root user (appuser)
  → HEALTHCHECK on /healthz
  → CMD node dist/index.js
```

### 7.2 Azure Container App Configuration

```yaml
resources:
  containers:
    - name: rsm-ado-mcp
      image: <acr>.azurecr.io/rsm-ado-mcp-readonly:latest
      env:
        - name: ADO_ORG
          value: <organization>
        - name: ADO_MCP_AUTH_TOKEN
          secretRef: ado-pat-token
      resources:
        cpu: 0.5
        memory: 1Gi
  scale:
    minReplicas: 1
    maxReplicas: 3
ingress:
  external: true
  targetPort: 3000
  transport: http
```

## 8. Security Considerations

1. **Read-only enforcement**: All write/mutating tools have been removed at the source code level. No tool can create, update, or delete Azure DevOps resources.
2. **PAT token scope**: The PAT should be configured with minimum required permissions (Code: Read, Work Items: Read, Wiki: Read, Project & Team: Read).
3. **Non-root container**: The Docker image runs as `appuser` (non-root).
4. **No secrets in image**: PAT token is injected via environment variable / secret reference at runtime.
5. **CORS**: Enabled via `cors` middleware; should be configured with specific origins in production.
6. **Session isolation**: Each MCP client session gets its own transport instance.

## 9. API Reference

### Health Endpoints

```
GET /healthz → 200 { "status": "healthy" }
GET /readyz  → 200 { "status": "ready" }
```

### MCP Protocol Endpoint

```
POST   /mcp  → JSON-RPC request/response (MCP protocol)
GET    /mcp  → SSE stream for server-to-client notifications (requires mcp-session-id header)
DELETE /mcp  → Session teardown (requires mcp-session-id header)
```

All MCP requests after initialization must include the `mcp-session-id` header returned during the initialize handshake.
