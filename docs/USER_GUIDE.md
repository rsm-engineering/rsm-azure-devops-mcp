# User Guide

## RSM Azure DevOps MCP Server (Read-Only)

---

## 1. Prerequisites

- **Node.js 22+** (for local development)
- **Docker** (for container deployment)
- **Azure DevOps PAT** with the following scopes:
  - Code: Read
  - Work Items: Read
  - Wiki: Read
  - Project and Team: Read
  - Search: Read (for code/wiki/work item search)

## 2. Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/rsm-engineering/rsm-azure-devops-mcp.git
cd rsm-azure-devops-mcp

# Install dependencies and build
npm install
npm run build

# Set environment variables
export ADO_ORG=your-organization
export ADO_MCP_AUTH_TOKEN=your-pat-token

# Start the server
npm start
```

The server starts on `http://localhost:3000`.

### Docker

```bash
# Build the image
docker build -t rsm-ado-mcp-readonly .

# Run the container
docker run -d \
  -p 3000:3000 \
  -e ADO_ORG=your-organization \
  -e ADO_MCP_AUTH_TOKEN=your-pat-token \
  rsm-ado-mcp-readonly
```

### Verify Server Health

```bash
curl http://localhost:3000/healthz
# → {"status":"healthy"}
```

## 3. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADO_ORG` | Yes | - | Your Azure DevOps organization name |
| `ADO_MCP_AUTH_TOKEN` | Yes | - | Personal Access Token |
| `ADO_TENANT_ID` | No | auto-detected | Azure AD tenant ID |
| `ADO_DOMAINS` | No | `core,repositories,search` | Enabled tool domains |
| `PORT` | No | `3000` | HTTP server port |
| `LOG_LEVEL` | No | `info` | Log verbosity (error, warn, info, debug) |

## 4. Connecting MCP Clients

### Claude Desktop / Claude Code

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### Generic MCP Client

The server exposes the MCP protocol at:

- **POST** `http://<host>:3000/mcp` — Send JSON-RPC requests
- **GET** `http://<host>:3000/mcp` — SSE stream (with `mcp-session-id` header)
- **DELETE** `http://<host>:3000/mcp` — End session (with `mcp-session-id` header)

**Session flow:**
1. Send an `initialize` request via POST to `/mcp`
2. The response includes an `mcp-session-id` header
3. Include this header in all subsequent requests
4. Optionally open a GET SSE stream for server notifications

## 5. Available Tools

### Core Tools

#### `list_projects`
List all projects in the Azure DevOps organization.

```
Parameters: (none required)
```

#### `list_project_teams`
List teams within a specific project.

```
Parameters:
  - project: string (required) — Project name or ID
```

#### `get_identity_ids`
Resolve Azure DevOps identity IDs to display names and email addresses.

```
Parameters:
  - identityIds: string[] (required) — Array of identity IDs to resolve
```

### Repository Tools

#### `list_repos_by_project`
List all Git repositories in a project.

```
Parameters:
  - project: string (required)
```

#### `list_pull_requests_by_repo_or_project`
List pull requests with filtering options.

```
Parameters:
  - project: string (required)
  - repositoryId: string (optional)
  - status: "Active" | "Completed" | "Abandoned" | "All" (default: Active)
  - created_by_user: string (optional) — Email of creator
  - user_is_reviewer: string (optional) — Email of reviewer
  - top: number (default: 50)
```

#### `get_pull_request_by_id`
Get detailed information about a specific pull request.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - pullRequestId: number (required)
```

#### `list_pull_requests_by_assigned_to`
**NEW** — Find PRs where a linked work item is assigned to a specific user.

```
Parameters:
  - project: string (required)
  - repositoryId: string (optional)
  - assignedToEmail: string (required) — Email of the work item assignee
  - status: "Active" | "Completed" | "Abandoned" | "All" (default: Active)
  - top: number (default: 50)
```

**Example use case:** "Show me all active PRs related to work items assigned to jane.doe@rsm.com"

This tool:
1. Fetches pull requests matching the status filter
2. Looks up linked work items for each PR
3. Checks if any linked work item's `System.AssignedTo` matches the email
4. Returns only matching PRs with their linked work item details

#### `list_branches_by_repo`
List all branches in a repository.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
```

#### `list_my_branches_by_repo`
List branches owned by the authenticated user.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
```

#### `get_repo_by_name_or_id`
Get repository details by name or ID.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required) — Repo name or GUID
```

#### `get_branch_by_name`
Get details for a specific branch.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - branchName: string (required)
```

#### `list_pull_request_threads`
List discussion threads on a pull request.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - pullRequestId: number (required)
```

#### `list_pull_request_thread_comments`
List comments within a specific PR thread.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - pullRequestId: number (required)
  - threadId: number (required)
```

#### `search_commits`
Search for commits by various criteria.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - author: string (optional)
  - fromDate: string (optional)
  - toDate: string (optional)
  - itemPath: string (optional)
```

#### `list_pull_requests_by_commits`
Find pull requests associated with specific commits.

```
Parameters:
  - project: string (required)
  - repositoryId: string (required)
  - commitIds: string[] (required)
```

### Search Tools

#### `search_code`
Full-text search across code repositories.

```
Parameters:
  - searchText: string (required)
  - project: string[] (optional)
  - repository: string[] (optional)
  - path: string[] (optional)
  - branch: string[] (optional)
  - top: number (default: 5)
```

#### `search_wiki`
Search wiki pages.

```
Parameters:
  - searchText: string (required)
  - project: string[] (optional)
  - wiki: string[] (optional)
  - top: number (default: 10)
```

#### `search_workitem`
Search work items.

```
Parameters:
  - searchText: string (required)
  - project: string[] (optional)
  - workItemType: string[] (optional)
  - state: string[] (optional)
  - assignedTo: string[] (optional)
  - top: number (default: 10)
```

## 6. Azure Container App Deployment

### Build and Push Image

```bash
# Build the image
docker build -t rsm-ado-mcp-readonly .

# Tag for ACR
docker tag rsm-ado-mcp-readonly <your-acr>.azurecr.io/rsm-ado-mcp-readonly:latest

# Push to ACR
az acr login --name <your-acr>
docker push <your-acr>.azurecr.io/rsm-ado-mcp-readonly:latest
```

### Deploy to Azure Container Apps

```bash
# Create the container app
az containerapp create \
  --name rsm-ado-mcp \
  --resource-group <your-rg> \
  --environment <your-env> \
  --image <your-acr>.azurecr.io/rsm-ado-mcp-readonly:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    ADO_ORG=<your-org> \
    ADO_MCP_AUTH_TOKEN=secretref:ado-pat-token

# Set the PAT token as a secret
az containerapp secret set \
  --name rsm-ado-mcp \
  --resource-group <your-rg> \
  --secrets ado-pat-token=<your-pat-token>
```

### Configure Health Probes

The container is preconfigured with a `HEALTHCHECK` on `/healthz`. Azure Container Apps will use the ingress health probes automatically:

- **Liveness probe**: `GET /healthz`
- **Readiness probe**: `GET /readyz`

## 7. Troubleshooting

### Server won't start

**Error: `Environment variable ADO_ORG is required`**
Ensure `ADO_ORG` is set to your Azure DevOps organization name.

**Error: `Environment variable 'ADO_MCP_AUTH_TOKEN' is required`**
Ensure `ADO_MCP_AUTH_TOKEN` is set to a valid PAT token.

### Authentication errors (401/403)

- Verify your PAT token has not expired.
- Ensure the PAT has the required scopes (Code: Read, Work Items: Read, etc.).
- Check the organization name matches the PAT's organization.

### No search results

- Ensure the Azure DevOps organization has the Search extension installed.
- Verify the PAT has Search permissions.

### `list_pull_requests_by_assigned_to` returns empty results

- Verify PRs have linked work items (not all PRs link to work items).
- Check the email address matches exactly (case-insensitive).
- Ensure linked work items actually have `System.AssignedTo` set.

### Container health check failures

- Check container logs: `az containerapp logs show --name rsm-ado-mcp --resource-group <rg>`
- Verify the `PORT` environment variable matches the `targetPort` in ingress config.
- Ensure the container has network access to `dev.azure.com` and `almsearch.dev.azure.com`.

### Increasing log verbosity

Set `LOG_LEVEL=debug` to see detailed request/response logging:

```bash
docker run -e LOG_LEVEL=debug -e ADO_ORG=... -e ADO_MCP_AUTH_TOKEN=... rsm-ado-mcp-readonly
```
