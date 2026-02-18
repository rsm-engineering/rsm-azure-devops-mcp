# Troubleshooting

## Deployment Issues

### Deploy script exits with no output

**Symptom:** `bash deploy/deploy.sh` exits with code 1 and no output.

**Solution:** Run the deployment steps individually to identify which step fails:

```bash
source deploy/config.sh

# Test each step
az group create --name $RESOURCE_GROUP --location $LOCATION
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic
# ... continue with each step from deploy.sh
```

### Key Vault name already taken

**Symptom:** `az keyvault create` fails with "VaultAlreadyExists" or similar.

**Solution:** Key Vault names are globally unique. Edit `KEY_VAULT_NAME` in `deploy/config.sh` to use a unique name, then re-run the deployment.

### MSYS path mangling on Windows (Git Bash)

**Symptom:** `az role assignment create` fails because `--scope /subscriptions/...` gets converted to `C:/Program Files/Git/subscriptions/...`.

**Solution:** The deploy script already includes `MSYS_NO_PATHCONV=1` for the role assignment command. If you're running commands manually in Git Bash, prefix them:

```bash
MSYS_NO_PATHCONV=1 az role assignment create --scope /subscriptions/...
```

### Container App fails to start

**Symptom:** Container App is in a failed state or `/healthz` returns errors.

**Solutions:**
1. Check container logs:
   ```bash
   az containerapp logs show --name ado-mcp-server --resource-group rg-ado-mcp --type console
   ```
2. Verify environment variables are set:
   ```bash
   az containerapp show --name ado-mcp-server --resource-group rg-ado-mcp --query "properties.template.containers[0].env"
   ```
3. Ensure `AZURE_KEYVAULT_URL` points to a valid Key Vault URL (e.g., `https://kv-rsm-ado-mcp.vault.azure.net/`).

### ACR build fails

**Symptom:** `az acr build` fails during Docker image build.

**Solutions:**
1. Verify the Dockerfile exists in the project root.
2. Check that the ACR name in `deploy/config.sh` matches the actual ACR.
3. Ensure you're logged in: `az acr login --name <ACR_NAME>`.

## Authentication Issues

### 401 Unauthorized on `/mcp`

**Possible causes:**

1. **Invalid or missing API key:** Ensure the `x-api-key` header contains the correct `rsmk_...` key returned during user registration.
2. **Invalid Bearer token:** If sending an `Authorization: Bearer` header, the AAD token must be valid. An invalid Bearer token returns 401 without falling back to API key.
3. **User not registered:** The API key doesn't match any user in Key Vault. Re-register the user via the admin API.

### 403 Forbidden — "User is not registered"

**Symptom:** `POST /mcp` returns `User 'email@example.com' is not registered. Contact an admin.`

**Solution:** The authenticated user (resolved from API key or AAD token) doesn't have a Key Vault secret. Register them:

```bash
curl -X POST https://<FQDN>/admin/users \
  -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "email@example.com", "org": "MyOrg", "url": "https://dev.azure.com/MyOrg", "pat": "<PAT>"}'
```

### 403 Forbidden — "Session belongs to another user"

**Symptom:** Requests with `mcp-session-id` header return "Session belongs to another user."

**Cause:** The session was created by a different user. Session ownership is enforced on every request.

**Solution:** Each user must use their own session. Do not share `mcp-session-id` values between users. Start a new session by sending an `initialize` request without the `mcp-session-id` header.

### Admin API returns 401

**Symptom:** Admin endpoints (`/admin/users`) return 401.

**Solutions:**
1. Admin endpoints require an AAD Bearer token (`Authorization: Bearer <token>`), not an `x-api-key` header.
2. Obtain a token: `az account get-access-token --resource <AAD_CLIENT_ID> --query accessToken -o tsv`
3. Ensure `AAD_TENANT_ID` and `AAD_CLIENT_ID` are configured on the container.

### Admin API returns 403 — "User is not an authorized admin"

**Symptom:** Admin endpoint returns 403 with a valid AAD token.

**Solution:** Your email is not in the `ADMIN_EMAILS` environment variable. Update the container's `ADMIN_EMAILS` env var to include your AAD email address (comma-separated if multiple admins).

### Admin API returns 503

**Symptom:** Admin endpoints return 503 "not configured".

**Solutions:**
1. Ensure `ADMIN_EMAILS` is set on the container (comma-separated email addresses).
2. Ensure `AAD_TENANT_ID` and `AAD_CLIENT_ID` are set (AAD authentication is required for admin access).

## Key Vault Issues

### "Access denied" or "Forbidden" from Key Vault

**Symptom:** Server logs show Key Vault access errors.

**Solutions:**

1. Verify the Container App's Managed Identity has the "Key Vault Secrets Officer" role:
   ```bash
   PRINCIPAL_ID=$(az containerapp show --name ado-mcp-server --resource-group rg-ado-mcp --query "identity.principalId" -o tsv)
   az role assignment list --assignee $PRINCIPAL_ID --scope $(az keyvault show --name kv-rsm-ado-mcp --query id -o tsv)
   ```

2. If the role is missing, add it:
   ```bash
   KV_ID=$(az keyvault show --name kv-rsm-ado-mcp --query id -o tsv)
   MSYS_NO_PATHCONV=1 az role assignment create \
     --role "Key Vault Secrets Officer" \
     --assignee-object-id $PRINCIPAL_ID \
     --assignee-principal-type ServicePrincipal \
     --scope $KV_ID
   ```

3. Ensure the Key Vault uses **RBAC** authorization (not access policies):
   ```bash
   az keyvault show --name kv-rsm-ado-mcp --query "properties.enableRbacAuthorization"
   ```

### User config cache is stale

**Symptom:** After updating a user's config in Key Vault, the old config is still used.

**Solution:** User configs are cached in-memory for 5 minutes. Wait for the cache to expire, or restart the Container App:

```bash
az containerapp revision restart --name ado-mcp-server --resource-group rg-ado-mcp --revision <REVISION_NAME>
```

## Azure DevOps API Issues

### "Failed to find api location" error

**Symptom:** Tool calls return `Failed to find api location for area: Location id: ...`

**Cause:** The Azure DevOps organization name or URL is incorrect.

**Solution:** Verify the user's registration has the correct `org` and `url` values. The `url` should be the full URL (e.g., `https://dev.azure.com/MyOrg`).

### Search tools fail with 401/403

**Symptom:** `search_code`, `search_wiki`, or `search_workitem` return authentication errors.

**Cause:** The user's PAT doesn't have the required scopes.

**Solution:** Ensure the PAT has these read scopes:
- **Code (Read)** — for `search_code`
- **Wiki (Read)** — for `search_wiki`
- **Work Items (Read)** — for `search_workitem`

### `core_get_identity_ids` fails

**Symptom:** Returns "No identities found" or access error.

**Cause:** The PAT may lack the Identity (Read) scope, or the identity search endpoint requires elevated permissions.

**Solution:** This is a known limitation with PAT-based authentication. The identity search API may require additional PAT scopes or different authentication methods.

## MCP Client Issues

### Server not showing up in Claude Desktop

**Solutions:**
1. Verify the config JSON is valid (check for trailing commas, etc.).
2. Ensure the `type` is `"streamableHttp"` (not `"stdio"`).
3. Restart Claude Desktop completely after editing the config.
4. Test the server URL directly: `curl https://<FQDN>/healthz`

### Tools not appearing in VS Code Agent Mode

**Solutions:**
1. Reload the VS Code window: `Ctrl+Shift+P` > `Developer: Reload Window`.
2. Verify `.vscode/mcp.json` is correctly formatted.
3. Click "Add Context" in Agent Mode and check that tools are listed.
4. Check the Output panel for MCP-related errors.

### Too many tools (128 tool limit)

**Symptom:** MCP client warns about exceeding the tool limit.

**Solution:** Use the `domains` field during user registration to limit which tool domains are enabled. For example, register with `"domains": "core,repositories"` to exclude search tools.

## Server Logs

To increase log verbosity, set the `LOG_LEVEL` environment variable on the Container App:

```bash
az containerapp update --name ado-mcp-server --resource-group rg-ado-mcp \
  --set-env-vars "LOG_LEVEL=debug"
```

Available log levels: `error`, `warn`, `info`, `debug`.

View logs:

```bash
az containerapp logs show --name ado-mcp-server --resource-group rg-ado-mcp --type console --follow
```
