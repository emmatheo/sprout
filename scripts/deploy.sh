#!/bin/bash

# Sprout Deployment Script
# Usage: ./deploy.sh [testnet|mainnet]

ENVIRONMENT=${1:-testnet}

echo "🚀 Deploying Sprout to $ENVIRONMENT..."

# 1. Switch active env
sui client switch --env $ENVIRONMENT

# 2. Build and Publish
PUBLISH_OUT=$(sui client publish ./contracts --gas-budget 200000000 --json)

# 3. Parse output (requires jq)
PACKAGE_ID=$(echo $PUBLISH_OUT | jq -r '.objectChanges[] | select(.type == "published") | .packageId')
PLATFORM_CONFIG_ID=$(echo $PUBLISH_OUT | jq -r '.objectChanges[] | select(.objectType | contains("::platform::PlatformConfig")) | .objectId')
UPGRADE_CAP_ID=$(echo $PUBLISH_OUT | jq -r '.objectChanges[] | select(.objectType | contains("::package::UpgradeCap")) | .objectId')

echo "--------------------------------------"
echo "✅ Deployment Successful!"
echo "Package ID: $PACKAGE_ID"
echo "Platform Config ID: $PLATFORM_CONFIG_ID"
echo "--------------------------------------"

echo ""
echo "PASTE THESE INTO frontend/.env.local:"
echo "NEXT_PUBLIC_SPROUT_PACKAGE_ID=$PACKAGE_ID"
echo "NEXT_PUBLIC_PLATFORM_CONFIG_ID=$PLATFORM_CONFIG_ID"

echo ""
echo "PASTE THESE INTO backend/.env:"
echo "SPROUT_PACKAGE_ID=$PACKAGE_ID"
echo "--------------------------------------"
