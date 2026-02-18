# Contributing

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Docker](https://docs.docker.com/get-docker/) (optional, for local container testing)
- An Azure subscription (for Key Vault access during development)

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

The project compiles TypeScript from `src/` to `dist/`.

### Run locally

The server requires `AZURE_KEYVAULT_URL` to be set. For local development, authenticate to Key Vault via Azure CLI:

```bash
az login

export AZURE_KEYVAULT_URL="https://kv-rsm-ado-mcp.vault.azure.net/"
export ADMIN_API_KEY="local-dev-key"
export PORT=3000

npm start
```

The server starts on `http://localhost:3000`. Test with:

```bash
curl http://localhost:3000/healthz
```

### Run with Docker locally

```bash
docker build -t ado-mcp-readonly .

docker run -p 3000:3000 \
  -e AZURE_KEYVAULT_URL="https://kv-rsm-ado-mcp.vault.azure.net/" \
  -e ADMIN_API_KEY="local-dev-key" \
  ado-mcp-readonly
```

Note: For Key Vault access from a local Docker container, you'll need to configure Azure credentials inside the container or use a local secrets store for development.

## Project Structure

```
src/
  index.ts              # Express app, MCP session management, HTTP endpoints
  tools.ts              # Tool domain router (core, repositories, search)
  auth.ts               # Session authenticator factory
  logger.ts             # Winston logger (JSON format)
  version.ts            # Package version reader
  useragent.ts          # User-Agent header composer
  auth/
    types.ts            # Shared types (UserConfig, AuthenticatedUser, SessionContext)
    keyvault-store.ts   # Key Vault CRUD with 5-min cache
    aad-validator.ts    # AAD/Entra ID JWT validation (jose)
    middleware.ts       # Express auth middleware for /mcp routes
  admin/
    routes.ts           # Admin API routes (user CRUD)
  tools/
    core.ts             # Core domain tools (projects, teams, identities)
    repositories.ts     # Repository domain tools (repos, branches, PRs, commits)
    search.ts           # Search domain tools (code, wiki, work items)
  shared/
    domains.ts          # Domain enum and manager
deploy/
  deploy.sh             # Full Azure deployment script
  rebuild.sh            # Rebuild Docker image and restart Container App
  config.sh             # Shared configuration (resource names, sizing)
docs/
  GETTINGSTARTED.md     # Deployment and client setup guide
  TOOLSET.md            # Detailed tool parameter documentation
  TROUBLESHOOTING.md    # Common issues and solutions
  FAQ.md                # Frequently asked questions
  HOWTO.md              # Tips for better MCP experience
  EXAMPLES.md           # Example prompts and usage
```

## Coding Guidelines

### Read-only principle

This server is intentionally read-only. Do not add tools that create, update, or delete Azure DevOps resources. All tools should only retrieve data.

### Tool naming

Tools are named with a domain prefix:
- `core_` for core/project tools
- `repo_` for repository tools
- `search_` for search tools

### Per-session scoping

All tools receive credentials through closures (`tokenProvider`, `connectionProvider`). Never access global state for user credentials. Each MCP server instance is scoped to a single user's session.

### Code style

- TypeScript strict mode
- Format with: `npm run format`
- Lint before committing

### Testing

```bash
# Run all tests
npm test

# Run a specific test file
npm test test/src/utils.test.ts

# Run with coverage
npm test -- --coverage
```

Tests use Jest with `ts-jest`. Test files are in the `test/` directory mirroring the `src/` structure.

## Deployment

### Full deployment

```bash
export ADMIN_API_KEY="your-admin-key"
export AAD_TENANT_ID="your-tenant-id"    # or "placeholder"
export AAD_CLIENT_ID="your-client-id"    # or "placeholder"
export AZURE_SUBSCRIPTION_ID="your-subscription-id"

bash deploy/deploy.sh
```

### Rebuild after code changes

```bash
bash deploy/rebuild.sh
```

### Configuration

Edit `deploy/config.sh` to customize resource names, region, and container sizing before deploying.

## Architecture Notes

- **Transport**: Streamable HTTP (not stdio). The server is a standard Express HTTP app.
- **Sessions**: Per-user MCP server instances. Each session has its own `McpServer`, `StreamableHTTPServerTransport`, and credential closures.
- **Auth flow**: Request → middleware (API key or AAD JWT) → Key Vault lookup → session creation/reuse → tool execution with user's PAT.
- **Caching**: User configs are cached in-memory for 5 minutes to reduce Key Vault calls.

## License

Licensed under the [MIT License](./LICENSE.md).

Based on [Microsoft's azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp), licensed under MIT.
