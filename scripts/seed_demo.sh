#!/bin/bash

# Sprout Seed Demo Script
# Usage: ./seed_demo.sh <address>

ADDRESS=$1
API_URL=${2:-"http://localhost:4000"}

if [ -z "$ADDRESS" ]; then
  echo "Usage: ./seed_demo.sh <user_sui_address>"
  exit 1
fi

echo "🌱 Seeding 10 purchase round-ups for $ADDRESS..."

AMOUNTS=(4.30 2.85 11.50 6.20 1.95 8.75 3.40 22.10 0.99 5.60)

for val in "${AMOUNTS[@]}"; do
  echo "Simulating purchase: \$$val"
  curl -X POST "$API_URL/api/roundups/simulate" \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"$ADDRESS\", \"purchaseAmount\": $val}"
  echo ""
done

echo "--------------------------------------"
echo "✅ Seeding complete!"
curl -s "$API_URL/api/roundups/$ADDRESS/pending" | jq .
echo "--------------------------------------"
