# Getting Started

This guide walks through deploying the RSM Azure DevOps MCP Server and connecting MCP clients to it.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) v2.50+
- An Azure subscription
- [Node.js](https://nodejs.org/) 20+ (for local development only)
- An Azure DevOps Personal Access Token (PAT) with read scopes for each user

## 1. Deploy to Azure

### Set environment variables

```bash
export ADMIN_API_KEY="$(openssl rand -base64 32)"   # Generate a strong admin key
export AAD_TENANT_ID="your-aad-tenant-id"           # Or "placeholder" if not using AAD auth
export AAD_CLIENT_ID="your-aad-client-id"           # Or "placeholder" if not using AAD auth
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
```

Save `ADMIN_API_KEY` somewhere safe -- you'll need it to register users.

### Run the deployment script

```bash
az login
bash deploy/deploy.sh
```

The script creates:

1. **Resource Group** (`rg-ado-mcp`)
2. **Azure Container Registry** (`rsmadoacrmcp`) -- builds the Docker image
3. **Azure Key Vault** (`kv-rsm-ado-mcp`) -- stores user configs with RBAC
4. **Container App Environment** (`ado-mcp-env`)
5. **Container App** (`ado-mcp-server`) -- with system-assigned Managed Identity
6. **RBAC role assignment** -- grants the Managed Identity "Key Vault Secrets Officer"

On completion, the script outputs the FQDN (e.g., `ado-mcp-server.livelybay-fbc49001.eastus.azurecontainerapps.io`).

### Verify deployment

```bash
curl https://<FQDN>/healthz
# {"status":"healthy"}
```

### Configuration

Edit `deploy/config.sh` to customize resource names, region, and container sizing before deploying:

```bash
RESOURCE_GROUP="rg-ado-mcp"
LOCATION="eastus"
ACR_NAME="rsmadoacrmcp"               # Must be globally unique
KEY_VAULT_NAME="kv-rsm-ado-mcp"       # Must be globally unique
CONTAINER_APP_NAME="ado-mcp-server"
CPU="0.25"
MEMORY="0.5Gi"
MIN_REPLICAS=1
MAX_REPLICAS=3
```

## 2. Register Users

Each user needs an Azure DevOps org URL and PAT registered via the admin API.

### Create a PAT

1. Go to `https://dev.azure.com/{org}/_usersSettings/tokens`
2. Create a new token with these read-only scopes:
   - **Project and Team**: Read
   - **Code**: Read
   - **Work Items**: Read
   - **Wiki**: Read (optional, for `search_wiki`)
3. Copy the token

### Register via admin API

```bash
curl -X POST https://<FQDN>/admin/users \
  -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "org": "MyOrg",
    "url": "https://dev.azure.com/MyOrg",
    "pat": "<PAT_FROM_STEP_ABOVE>"
  }'
```

Response:

```json
{
  "email": "user@example.com",
  "org": "MyOrg",
  "url": "https://dev.azure.com/MyOrg",
  "domains": "core,repositories,search",
  "apiKey": "rsmk_abc123...",
  "registeredAt": "2026-02-18T20:01:41.727Z"
}
```

Give the user their `apiKey` value. They'll use it in their MCP client config.

## 3. Connect MCP Clients

### Claude Desktop

Open Claude Desktop, go to **Settings > Developer > Edit Config**, and add:

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

Restart Claude Desktop. The Azure DevOps tools should appear in the tools list.

### VS Code (GitHub Copilot Agent Mode)

Create `.vscode/mcp.json` in your project:

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

Switch to Agent Mode in GitHub Copilot Chat and select the Azure DevOps tools.

### Claude Code CLI

```bash
claude mcp add azure-devops \
  --transport streamable-http \
  "https://<FQDN>/mcp" \
  --header "x-api-key: rsmk_..."
```

### Cursor

Create `.cursor/mcp.json`:

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

## 4. Try It Out

Once connected, try prompts like:

- "List my ADO projects"
- "List repos in the Contoso project"
- "Show me recent commits in the main branch"
- "List open pull requests"
- "Search work items for authentication"

## 5. Managing Users

### List registered users

```bash
curl https://<FQDN>/admin/users \
  -H "x-api-key: $ADMIN_API_KEY"
```

### Remove a user

```bash
curl -X DELETE https://<FQDN>/admin/users/user@example.com \
  -H "x-api-key: $ADMIN_API_KEY"
```

### Rotate a user's API key

```bash
curl -X POST https://<FQDN>/admin/users/user@example.com/rotate-key \
  -H "x-api-key: $ADMIN_API_KEY"
```

The old key stops working immediately. Provide the new key to the user.

## 6. Updating the Server

After making code changes:

```bash
bash deploy/rebuild.sh
```

This rebuilds the Docker image in ACR and restarts the Container App.

## Local Development

For local development without Azure infrastructure:

```bash
npm install
npm run build
npm start
```

Note: The server requires `AZURE_KEYVAULT_URL` to be set. For local development, you can use the Azure CLI to authenticate to Key Vault (`az login`), and set the variable to your Key Vault URL.
