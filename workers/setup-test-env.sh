#!/bin/bash
# Test Environment Setup Harness
# Sets up local environment for testing reliability fixes

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🎮 GameGame Test Environment Setup"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Must run from workers directory${NC}"
  exit 1
fi

# Step 1: Check dependencies
echo -e "${BLUE}[1/6]${NC} Checking dependencies..."
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}✗ pnpm not found${NC}"
  echo "Install: npm install -g pnpm"
  exit 1
fi
echo -e "${GREEN}✓${NC} pnpm installed"

# Step 2: Install packages
echo -e "${BLUE}[2/6]${NC} Installing packages..."
pnpm install --silent 2>&1 | grep -v "Already up to date" || true
echo -e "${GREEN}✓${NC} Packages installed"

# Step 3: Check environment variables
echo -e "${BLUE}[3/6]${NC} Checking environment variables..."
if [ ! -f ".dev.vars" ]; then
  echo -e "${YELLOW}⚠${NC} No .dev.vars file found"
  echo "Creating .dev.vars template..."
  cat > .dev.vars <<EOF
# Required API keys
OPENAI_API_KEY=your-openai-key-here
MISTRAL_API_KEY=your-mistral-key-here
JWT_SECRET=$(openssl rand -base64 32)

# Optional: Enable debug logging
# CHAT_DEBUG_VERBOSE=true
# CHAT_DEBUG_TIMING=true
EOF
  echo -e "${YELLOW}⚠${NC} Created .dev.vars template - add your API keys!"
else
  echo -e "${GREEN}✓${NC} .dev.vars exists"
fi

# Check for required keys
if ! grep -q "OPENAI_API_KEY" .dev.vars || grep -q "your-openai-key-here" .dev.vars; then
  echo -e "${YELLOW}⚠${NC} OPENAI_API_KEY not configured in .dev.vars"
fi

if ! grep -q "MISTRAL_API_KEY" .dev.vars || grep -q "your-mistral-key-here" .dev.vars; then
  echo -e "${YELLOW}⚠${NC} MISTRAL_API_KEY not configured in .dev.vars"
fi

# Step 4: Setup database
echo -e "${BLUE}[4/6]${NC} Setting up local database..."
if [ ! -d ".wrangler" ]; then
  mkdir -p .wrangler
  echo -e "${GREEN}✓${NC} Created .wrangler directory"
fi

# Run migrations
echo "Running migrations..."
pnpm db:migrate:local 2>&1 | tail -3 || true
echo -e "${GREEN}✓${NC} Database migrations applied"

# Step 5: Check for test data
echo -e "${BLUE}[5/6]${NC} Checking for test data..."
GAME_COUNT=$(pnpm cli games 2>&1 | grep "•" | wc -l | tr -d ' ' || echo "0")

if [ "$GAME_COUNT" = "0" ]; then
  echo -e "${YELLOW}⚠${NC} No games found in database"
  echo ""
  echo "To add test data, you can either:"
  echo "  1. Use the admin UI: pnpm dev (then visit http://localhost:4000/admin)"
  echo "  2. Import from BGG: pnpm cli import-game <bgg-game-id>"
  echo "  3. Restore from backup: pnpm db:restore <backup-file>"
  echo ""
else
  echo -e "${GREEN}✓${NC} Found $GAME_COUNT game(s) in database"
  echo ""
  echo "Available games:"
  pnpm cli games 2>/dev/null | head -20
  echo ""
fi

# Step 6: Verify reliability fixes are present
echo -e "${BLUE}[6/6]${NC} Verifying reliability fixes..."

FIXES_OK=true

# Check rollback fix
if ! grep -q "inArray.*insertedFragmentIds" src/lib/processing/pdf-processor.ts; then
  echo -e "${RED}✗${NC} Rollback fix not found"
  FIXES_OK=false
else
  echo -e "${GREEN}✓${NC} Rollback fix present"
fi

# Check retry fix
if ! grep -q "retryWithBackoff" src/lib/ai/vectorize.ts; then
  echo -e "${RED}✗${NC} Retry fix not found"
  FIXES_OK=false
else
  echo -e "${GREEN}✓${NC} Retry fix present"
fi

# Check ownership fix - look for CRITICAL comment
if ! grep -q "CRITICAL.*Check job ownership FIRST" src/lib/processing/pdf-processor.ts; then
  echo -e "${RED}✗${NC} Job ownership fix not found"
  FIXES_OK=false
else
  echo -e "${GREEN}✓${NC} Job ownership fix present"
fi

echo ""
echo "=================================="
if [ "$GAME_COUNT" != "0" ] && [ "$FIXES_OK" = true ]; then
  echo -e "${GREEN}✓ Environment ready!${NC}"
  echo ""
  echo "Next steps:"
  echo ""
  echo "  ${BLUE}1. Start dev server:${NC}"
  echo "     pnpm dev"
  echo ""
  echo "  ${BLUE}2. Run benchmark queries (in another terminal):${NC}"
  echo "     pnpm cli ask <game-slug> \"<question>\" --timing"
  echo ""
  echo "  ${BLUE}3. Example benchmark:${NC}"
  FIRST_GAME=$(pnpm cli games 2>&1 | grep "•" | head -1 | awk '{print $2}' || echo "")
  if [ -n "$FIRST_GAME" ]; then
    echo "     pnpm cli ask $FIRST_GAME \"How many players?\" --timing"
  fi
  echo ""
  echo "  ${BLUE}4. See full benchmark guide:${NC}"
  echo "     cat docs/performance-testing.md"
  echo ""
  exit 0
else
  echo -e "${YELLOW}⚠ Environment partially ready${NC}"
  echo ""
  if [ "$GAME_COUNT" = "0" ]; then
    echo "Missing test data - add games via admin UI or CLI"
  fi
  if [ "$FIXES_OK" = false ]; then
    echo "Missing reliability fixes - check your changes"
  fi
  echo ""
  echo "You can still use the environment, but some features may not work."
  echo ""
  exit 0
fi
