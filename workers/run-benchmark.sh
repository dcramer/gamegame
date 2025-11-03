#!/bin/bash
# Run benchmark queries against local dev environment
# Based on docs/performance-testing.md

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "⚡ GameGame Performance Benchmark"
echo "=================================="
echo ""

# Check if dev server is running
if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
  echo -e "${RED}Error: Dev server not running${NC}"
  echo ""
  echo "Start dev server first:"
  echo "  pnpm dev"
  echo ""
  exit 1
fi

echo -e "${GREEN}✓${NC} Dev server is running"
echo ""

# Get list of games
GAMES=$(pnpm cli games 2>/dev/null | grep "•" | awk '{print $2}' || echo "")

if [ -z "$GAMES" ]; then
  echo -e "${RED}Error: No games found in database${NC}"
  echo ""
  echo "Add games first:"
  echo "  Visit http://localhost:4000/admin"
  echo ""
  exit 1
fi

GAME_COUNT=$(echo "$GAMES" | wc -l)
echo -e "${BLUE}Found $GAME_COUNT game(s)${NC}"
echo ""

# Select first game for benchmark
GAME_SLUG=$(echo "$GAMES" | head -1)

echo "Running benchmark queries for: $GAME_SLUG"
echo "=================================="
echo ""

# Test queries
QUERIES=(
  "How many players?"
  "What is the goal of the game?"
  "How do I set up the game?"
)

TOTAL_DURATION=0
TOTAL_TOKENS=0
QUERY_COUNT=0

for QUERY in "${QUERIES[@]}"; do
  echo -e "${BLUE}Query:${NC} $QUERY"
  echo "---"

  # Run query with timing
  OUTPUT=$(pnpm cli ask "$GAME_SLUG" "$QUERY" --timing 2>&1 || echo "ERROR")

  if echo "$OUTPUT" | grep -q "ERROR"; then
    echo -e "${RED}✗ Query failed${NC}"
    echo "$OUTPUT"
  else
    # Extract metrics
    DURATION=$(echo "$OUTPUT" | grep "Total Duration:" | awk '{print $3}' | sed 's/ms//')
    TOKENS=$(echo "$OUTPUT" | grep "Total:" | tail -1 | awk '{print $2}' | sed 's/,//g')
    TOOL_CALLS=$(echo "$OUTPUT" | grep "Tool Calls:" | awk '{print $3}')

    if [ -n "$DURATION" ] && [ -n "$TOKENS" ]; then
      echo -e "${GREEN}✓${NC} Duration: ${DURATION}ms | Tokens: ${TOKENS} | Tool Calls: ${TOOL_CALLS}"

      TOTAL_DURATION=$((TOTAL_DURATION + DURATION))
      TOTAL_TOKENS=$((TOTAL_TOKENS + TOKENS))
      QUERY_COUNT=$((QUERY_COUNT + 1))
    else
      echo -e "${YELLOW}⚠${NC} Could not parse metrics"
    fi

    # Show answer (first 100 chars)
    ANSWER=$(echo "$OUTPUT" | sed -n '/---/,/━━━/p' | sed '1d;$d' | head -c 100)
    echo "Answer: ${ANSWER}..."
  fi

  echo ""
done

# Summary
echo "=================================="
echo "Summary"
echo "=================================="
echo ""

if [ "$QUERY_COUNT" -gt 0 ]; then
  AVG_DURATION=$((TOTAL_DURATION / QUERY_COUNT))
  AVG_TOKENS=$((TOTAL_TOKENS / QUERY_COUNT))

  echo "Queries run: $QUERY_COUNT"
  echo "Avg Duration: ${AVG_DURATION}ms"
  echo "Avg Tokens: $AVG_TOKENS"
  echo ""

  # Performance assessment
  if [ "$AVG_DURATION" -lt 3000 ]; then
    echo -e "${GREEN}✓ Performance: Good (<3s)${NC}"
  elif [ "$AVG_DURATION" -lt 6000 ]; then
    echo -e "${YELLOW}⚠ Performance: Acceptable (3-6s)${NC}"
  else
    echo -e "${RED}✗ Performance: Poor (>6s)${NC}"
  fi

  if [ "$AVG_TOKENS" -lt 3000 ]; then
    echo -e "${GREEN}✓ Token usage: Good (<3000)${NC}"
  elif [ "$AVG_TOKENS" -lt 6000 ]; then
    echo -e "${YELLOW}⚠ Token usage: Acceptable (3000-6000)${NC}"
  else
    echo -e "${RED}✗ Token usage: Poor (>6000)${NC}"
  fi

  echo ""
  echo "Next steps:"
  echo ""
  echo "  ${BLUE}• Run more detailed benchmarks:${NC}"
  echo "    See docs/performance-testing.md"
  echo ""
  echo "  ${BLUE}• Check server logs for errors:${NC}"
  echo "    Look for [Vectorize] retry messages"
  echo "    Look for rollback messages"
  echo ""
  echo "  ${BLUE}• Enable verbose logging:${NC}"
  echo "    Add CHAT_DEBUG_VERBOSE=true to .dev.vars"
  echo ""
else
  echo -e "${RED}No successful queries${NC}"
  exit 1
fi
