#!/bin/bash
set -e

echo "🚀 GameGame Cloudflare Setup"
echo "============================="
echo ""

echo "📋 Step 1: Creating KV Namespaces..."
echo ""

# Create RATE_LIMIT KV namespace
echo "Creating RATE_LIMIT_KV..."
RATE_LIMIT_OUTPUT=$(pnpx wrangler kv:namespace create RATE_LIMIT 2>&1)
echo "$RATE_LIMIT_OUTPUT"
RATE_LIMIT_ID=$(echo "$RATE_LIMIT_OUTPUT" | grep -o 'id = "[^"]*"' | grep -o '"[^"]*"' | tr -d '"')

echo ""
echo "Creating JOB_STATUS_KV..."
JOB_STATUS_OUTPUT=$(pnpx wrangler kv:namespace create JOB_STATUS 2>&1)
echo "$JOB_STATUS_OUTPUT"
JOB_STATUS_ID=$(echo "$JOB_STATUS_OUTPUT" | grep -o 'id = "[^"]*"' | grep -o '"[^"]*"' | tr -d '"')

echo ""
echo "📋 Step 2: Creating D1 Database..."
echo ""

# Create D1 database
D1_OUTPUT=$(pnpx wrangler d1 create gamegame 2>&1)
echo "$D1_OUTPUT"
D1_ID=$(echo "$D1_OUTPUT" | grep -o 'database_id = "[^"]*"' | grep -o '"[^"]*"' | tr -d '"')

echo ""
echo "📋 Step 3: Creating Vectorize Index..."
echo ""

# Create Vectorize index
pnpx wrangler vectorize create gamegame-embeddings --dimensions=1536 --metric=cosine || echo "Index might already exist"

echo ""
echo "📋 Step 4: Creating R2 Bucket..."
echo ""

# Create R2 bucket
pnpx wrangler r2 bucket create gamegame-files || echo "Bucket might already exist"

echo ""
echo "📋 Step 5: Creating Queues..."
echo ""

# Create queues
pnpx wrangler queues create resource-processing || echo "Queue might already exist"
pnpx wrangler queues create resource-processing-dlq || echo "DLQ might already exist"

echo ""
echo "✅ Resources created! Now updating wrangler.toml..."
echo ""

# Update wrangler.toml with IDs
if [ -n "$RATE_LIMIT_ID" ]; then
    sed -i.bak "s/id = \"\" # Will be filled after: wrangler kv:namespace create RATE_LIMIT/id = \"$RATE_LIMIT_ID\"/" wrangler.toml
fi

if [ -n "$JOB_STATUS_ID" ]; then
    sed -i.bak "s/id = \"\" # Will be filled after: wrangler kv:namespace create JOB_STATUS/id = \"$JOB_STATUS_ID\"/" wrangler.toml
fi

if [ -n "$D1_ID" ]; then
    sed -i.bak "s/database_id = \"\" # Will be filled after: wrangler d1 create gamegame/database_id = \"$D1_ID\"/" wrangler.toml
fi

# Remove backup file
rm -f wrangler.toml.bak

echo "✅ wrangler.toml updated!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Set secrets:"
echo "   pnpx wrangler secret put OPENAI_API_KEY"
echo "   pnpx wrangler secret put MISTRAL_API_KEY"
echo "   pnpx wrangler secret put JWT_SECRET"
echo ""
echo "2. Run migrations:"
echo "   pnpx wrangler d1 migrations apply gamegame --remote"
echo ""
echo "3. Deploy:"
echo "   pnpx wrangler deploy"
echo ""
echo "🎉 Setup complete!"
