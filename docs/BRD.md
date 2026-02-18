# Business Requirements Document (BRD)

## RSM Azure DevOps MCP Server (Read-Only)

**Version:** 1.0
**Date:** 2026-02-18
**Author:** RSM Engineering

---

## 1. Executive Summary

RSM requires a read-only Model Context Protocol (MCP) server that provides AI assistants (Claude, Copilot, etc.) with structured access to Azure DevOps data. The server will be deployed as an Azure Container App, exposed over Streamable HTTP transport, and restricted to read-only operations to prevent unintended modifications to Azure DevOps resources.

## 2. Business Justification

- **AI-Assisted Development**: Enable AI tools to query Azure DevOps repositories, projects, and work items directly, improving developer productivity.
- **Security by Design**: A read-only server eliminates risk of accidental or unauthorized changes to Azure DevOps resources through AI tools.
- **Container-Native**: Azure Container App deployment provides scalability, cost efficiency, and integration with RSM's existing Azure infrastructure.
- **Standardized Protocol**: MCP is the emerging standard for AI-to-tool communication, ensuring compatibility with multiple AI clients.

## 3. Stakeholders

| Role | Responsibility |
|---|---|
| RSM Engineering Team | Development, deployment, and maintenance |
| Development Teams | End users connecting AI clients to the MCP server |
| DevOps / Platform Team | Azure Container App infrastructure and deployment |
| Security Team | Review and approval of read-only access patterns |

## 4. Functional Requirements

### 4.1 Core Domain (3 tools)

| ID | Requirement | Tool |
|---|---|---|
| FR-01 | List all projects in the Azure DevOps organization | `list_projects` |
| FR-02 | List teams within a project | `list_project_teams` |
| FR-03 | Resolve identity IDs to display names/emails | `get_identity_ids` |

### 4.2 Repositories Domain (12 tools)

| ID | Requirement | Tool |
|---|---|---|
| FR-04 | List repositories in a project | `list_repos_by_project` |
| FR-05 | List pull requests by repository or project | `list_pull_requests_by_repo_or_project` |
| FR-06 | Get pull request details by ID | `get_pull_request_by_id` |
| FR-07 | List branches in a repository | `list_branches_by_repo` |
| FR-08 | List branches owned by current user | `list_my_branches_by_repo` |
| FR-09 | Get repository details by name or ID | `get_repo_by_name_or_id` |
| FR-10 | Get branch details by name | `get_branch_by_name` |
| FR-11 | List pull request discussion threads | `list_pull_request_threads` |
| FR-12 | List comments within a PR thread | `list_pull_request_thread_comments` |
| FR-13 | Search commits by criteria | `search_commits` |
| FR-14 | List pull requests associated with specific commits | `list_pull_requests_by_commits` |
| FR-15 | **NEW**: Filter pull requests by linked work item assignee email | `list_pull_requests_by_assigned_to` |

### 4.3 Search Domain (3 tools)

| ID | Requirement | Tool |
|---|---|---|
| FR-16 | Search code across repositories | `search_code` |
| FR-17 | Search wiki pages | `search_wiki` |
| FR-18 | Search work items | `search_workitem` |

### 4.4 Transport & Deployment

| ID | Requirement |
|---|---|
| FR-19 | Expose MCP protocol over Streamable HTTP (POST/GET/DELETE on `/mcp`) |
| FR-20 | Support multiple concurrent client sessions |
| FR-21 | Provide health check endpoints (`/healthz`, `/readyz`) for container orchestration |
| FR-22 | Graceful shutdown on SIGTERM/SIGINT signals |
| FR-23 | Containerized deployment via Docker (multi-stage build, non-root user) |

### 4.5 Authentication

| ID | Requirement |
|---|---|
| FR-24 | Authenticate to Azure DevOps using a Personal Access Token (PAT) provided via environment variable |
| FR-25 | No interactive authentication flows (server is headless) |

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Container startup time | < 10 seconds |
| NFR-02 | Health check response time | < 100ms |
| NFR-03 | Logging | Structured JSON to stdout (container-compatible) |
| NFR-04 | Image size | < 200MB (Alpine-based) |
| NFR-05 | Security | Non-root container user, no write operations exposed |
| NFR-06 | Availability | Managed by Azure Container Apps scaling rules |

## 6. Acceptance Criteria

1. TypeScript project compiles without errors.
2. Server starts and responds to `/healthz` with HTTP 200.
3. MCP initialization handshake completes successfully via POST to `/mcp`.
4. All 18 tools are registered and callable by MCP clients.
5. No write/mutating tools are exposed (verified by tool inventory).
6. `list_pull_requests_by_assigned_to` correctly filters PRs by linked work item assignee.
7. Docker image builds successfully and runs with only `ADO_ORG` and `ADO_MCP_AUTH_TOKEN` set.
8. Graceful shutdown completes within 10 seconds.

## 7. Out of Scope

- **Write operations**: Creating, updating, or deleting any Azure DevOps resource.
- **Domains excluded**: Pipelines, Wiki management, Work Items (direct CRUD), Test Plans, Advanced Security.
- **Interactive authentication**: OAuth browser flows, Azure CLI credential, DefaultAzureCredential.
- **Stdio transport**: The server only supports Streamable HTTP.
- **Multi-organization support**: Single organization per server instance.
