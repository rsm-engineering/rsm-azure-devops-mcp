#!/usr/bin/env bash
# ===========================================================================
# deploy.sh - Full deployment of multi-tenant MCP server to Azure
#
# Creates: Resource Group, ACR, Key Vault, Container App Environment,
#          Container App with system-assigned Managed Identity, and grants
#          Key Vault Secrets Officer role to the Managed Identity.
#
# Required env vars (set before running):
#   AAD_TENANT_ID           - Azure AD tenant ID for authentication
#   AAD_CLIENT_ID           - Azure AD app registration client ID
#   ADMIN_EMAILS            - Comma-separated admin email addresses
#   AZURE_SUBSCRIPTION_ID   - Azure subscription ID
#
# Usage:
#   AAD_TENANT_ID="..." AAD_CLIENT_ID="..." ADMIN_EMAILS="admin@co.com" \
#     AZURE_SUBSCRIPTION_ID="..." bash deploy/deploy.sh
#
# Run from the repository root directory.
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
: "${AAD_TENANT_ID:?Set AAD_TENANT_ID before running this script}"
: "${AAD_CLIENT_ID:?Set AAD_CLIENT_ID before running this script}"
: "${ADMIN_EMAILS:?Set ADMIN_EMAILS before running this script (comma-separated admin email addresses)}"
: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID before running this script}"

az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
echo "Using subscription: ${AZURE_SUBSCRIPTION_ID}"
echo ""

# ---------------------------------------------------------------------------
# 1. Resource Group
# ---------------------------------------------------------------------------
echo "==> [1/7] Creating resource group..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output none
echo "    Resource group: ${RESOURCE_GROUP}"

# ---------------------------------------------------------------------------
# 2. Azure Container Registry
# ---------------------------------------------------------------------------
echo "==> [2/7] Creating ACR..."
az acr create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${ACR_NAME}" \
  --sku Basic \
  --admin-enabled true \
  --output none 2>/dev/null || echo "    ACR already exists."

ACR_LOGIN_SERVER=$(az acr show \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "loginServer" \
  --output tsv)
echo "    ACR: ${ACR_LOGIN_SERVER}"

# ---------------------------------------------------------------------------
# 3. Build Docker image
# ---------------------------------------------------------------------------
echo "==> [3/7] Building Docker image in ACR..."
az acr build \
  --registry "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  --file Dockerfile \
  .

# ---------------------------------------------------------------------------
# 4. Key Vault
# ---------------------------------------------------------------------------
echo "==> [4/7] Creating Key Vault..."
az keyvault create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${KEY_VAULT_NAME}" \
  --location "${LOCATION}" \
  --enable-rbac-authorization true \
  --output none 2>/dev/null || echo "    Key Vault already exists."

KV_URL="https://${KEY_VAULT_NAME}.vault.azure.net/"
echo "    Key Vault URL: ${KV_URL}"

# ---------------------------------------------------------------------------
# 5. Container App Environment
# ---------------------------------------------------------------------------
echo "==> [5/7] Creating Container App Environment..."
az containerapp env create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${CONTAINER_APP_ENV}" \
  --location "${LOCATION}" \
  --output none 2>/dev/null || echo "    Environment already exists."

# ---------------------------------------------------------------------------
# 6. Container App (with system-assigned Managed Identity)
# ---------------------------------------------------------------------------
echo "==> [6/7] Creating Container App..."

ACR_PASSWORD=$(az acr credential show \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "passwords[0].value" \
  --output tsv)

az containerapp create \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --environment "${CONTAINER_APP_ENV}" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
  --registry-server "${ACR_LOGIN_SERVER}" \
  --registry-username "${ACR_NAME}" \
  --registry-password "${ACR_PASSWORD}" \
  --target-port "${TARGET_PORT}" \
  --ingress external \
  --cpu "${CPU}" \
  --memory "${MEMORY}" \
  --min-replicas "${MIN_REPLICAS}" \
  --max-replicas "${MAX_REPLICAS}" \
  --system-assigned \
  --env-vars \
    "PORT=${TARGET_PORT}" \
    "LOG_LEVEL=info" \
    "AZURE_KEYVAULT_URL=${KV_URL}" \
    "AAD_TENANT_ID=${AAD_TENANT_ID}" \
    "AAD_CLIENT_ID=${AAD_CLIENT_ID}" \
    "ADMIN_EMAILS=${ADMIN_EMAILS}" \
  --output none 2>/dev/null || {
    echo "    Container App may already exist, updating..."
    az containerapp update \
      --name "${CONTAINER_APP_NAME}" \
      --resource-group "${RESOURCE_GROUP}" \
      --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
      --set-env-vars \
        "PORT=${TARGET_PORT}" \
        "LOG_LEVEL=info" \
        "AZURE_KEYVAULT_URL=${KV_URL}" \
        "AAD_TENANT_ID=${AAD_TENANT_ID}" \
        "AAD_CLIENT_ID=${AAD_CLIENT_ID}" \
        "ADMIN_EMAILS=${ADMIN_EMAILS}" \
      --output none
  }

FQDN=$(az containerapp show \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv)

echo "    Container App FQDN: ${FQDN}"

# ---------------------------------------------------------------------------
# 7. Grant Managed Identity access to Key Vault
# ---------------------------------------------------------------------------
echo "==> [7/7] Granting Key Vault access to Managed Identity..."

IDENTITY_PRINCIPAL_ID=$(az containerapp show \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "identity.principalId" \
  --output tsv)

KV_RESOURCE_ID=$(az keyvault show \
  --name "${KEY_VAULT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "id" \
  --output tsv)

# MSYS_NO_PATHCONV prevents Git Bash on Windows from mangling /subscriptions/... paths
MSYS_NO_PATHCONV=1 az role assignment create \
  --assignee-object-id "${IDENTITY_PRINCIPAL_ID}" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets Officer" \
  --scope "${KV_RESOURCE_ID}" \
  --output none 2>/dev/null || echo "    Role assignment already exists."

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "=========================================="
echo ""
echo "  MCP endpoint:    https://${FQDN}/mcp"
echo "  Health check:    https://${FQDN}/healthz"
echo "  Admin API:       https://${FQDN}/admin/users"
echo ""
echo "  Admin emails:    ${ADMIN_EMAILS}"
echo ""
echo "  Register a user (requires AAD Bearer token from an admin email):"
echo "    TOKEN=\$(az account get-access-token --resource ${AAD_CLIENT_ID} --query accessToken -o tsv)"
echo "    curl -X POST https://${FQDN}/admin/users \\"
echo "      -H \"Authorization: Bearer \$TOKEN\" \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"email\":\"user@example.com\",\"org\":\"MyOrg\",\"url\":\"https://dev.azure.com/MyOrg\",\"pat\":\"...\"}'"
echo ""
echo "  Claude Desktop config:"
echo "    {"
echo "      \"mcpServers\": {"
echo "        \"azure-devops\": {"
echo "          \"type\": \"streamableHttp\","
echo "          \"url\": \"https://${FQDN}/mcp\","
echo "          \"headers\": { \"x-api-key\": \"<USER_API_KEY>\" }"
echo "        }"
echo "      }"
echo "    }"
echo ""
