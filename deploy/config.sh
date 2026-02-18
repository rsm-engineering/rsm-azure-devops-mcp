# ===========================================================================
# config.sh - Shared configuration for all deploy scripts
#
# Edit these values to match your Azure environment.
# All deploy scripts source this file automatically.
# ===========================================================================

RESOURCE_GROUP="rg-ado-mcp"
LOCATION="eastus"
ACR_NAME="rsmadoacrmcp"                      # Must be globally unique, alphanumeric, 5-50 chars
CONTAINER_APP_ENV="ado-mcp-env"
CONTAINER_APP_NAME="ado-mcp-server"
IMAGE_NAME="ado-mcp-readonly"
IMAGE_TAG="latest"
TARGET_PORT=3000

KEY_VAULT_NAME="kv-rsm-ado-mcp"               # Must be globally unique, 3-24 chars

# Container sizing
CPU="0.25"
MEMORY="0.5Gi"
MIN_REPLICAS=1
MAX_REPLICAS=3
