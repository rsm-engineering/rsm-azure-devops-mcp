#!/usr/bin/env bash
# ===========================================================================
# rebuild.sh - Rebuild the Docker image and restart the Container App
#
# Usage:
#   bash deploy/rebuild.sh
#
# Run from the repository root directory.
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

ACR_LOGIN_SERVER=$(az acr show \
  --name "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "loginServer" \
  --output tsv)

echo ""
echo "==> [1/2] Rebuilding Docker image in ACR..."
az acr build \
  --registry "${ACR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  --file Dockerfile \
  .

echo "==> [2/2] Restarting Container App..."
az containerapp update \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
  --output none

echo ""
echo "==> Rebuild complete. Container App updated."
echo ""
