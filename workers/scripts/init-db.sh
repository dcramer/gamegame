#!/bin/bash
#
# Initialize local D1 database using Wrangler
# This applies Drizzle migrations to the local database
#

set -e

echo "🔄 Applying D1 migrations using Wrangler..."
echo ""

pnpm db:migrate:local

echo ""
echo "✅ Database initialized successfully!"
echo ""
echo "🚀 Start the dev server with: pnpm dev"
echo "🌐 Then access your app at: http://localhost:4000"
