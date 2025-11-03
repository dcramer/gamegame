#!/bin/bash

# Test questions from PERFORMANCE.md
QUESTIONS=(
  "How many players?"
  "How much money does each player start with?"
  "Can I move trucks on other players' turns?"
  "How do the docks work?"
  "How does setup work?"
  "What happens when I run out of money?"
)

GAME="speakeasy-2025"
OUTPUT_DIR="/tmp/fts-test-$(date +%s)"
mkdir -p "$OUTPUT_DIR"

echo "Running accuracy comparison tests..."
echo "Output directory: $OUTPUT_DIR"
echo ""

# Test with FTS enabled
echo "==================================="
echo "TESTING WITH FTS ENABLED"
echo "==================================="
for i in "${!QUESTIONS[@]}"; do
  question="${QUESTIONS[$i]}"
  echo "[$((i+1))/${#QUESTIONS[@]}] Testing: $question"

  timeout 120 pnpm cli ask "$GAME" "$question" > "$OUTPUT_DIR/fts_enabled_q$i.txt" 2>&1

  sleep 2
done

# Update .dev.vars to disable FTS
echo ""
echo "Switching to FTS disabled..."
sed -i 's/ENABLE_FULL_TEXT_SEARCH=true/ENABLE_FULL_TEXT_SEARCH=false/' .dev.vars

# Restart server
echo "Restarting server..."
lsof -ti :8787 | xargs kill -9 2>/dev/null
sleep 5

# Test with FTS disabled
echo ""
echo "==================================="
echo "TESTING WITH FTS DISABLED"
echo "==================================="
for i in "${!QUESTIONS[@]}"; do
  question="${QUESTIONS[$i]}"
  echo "[$((i+1))/${#QUESTIONS[@]}] Testing: $question"

  timeout 120 pnpm cli ask "$GAME" "$question" > "$OUTPUT_DIR/fts_disabled_q$i.txt" 2>&1

  sleep 2
done

# Restore FTS enabled
sed -i 's/ENABLE_FULL_TEXT_SEARCH=false/ENABLE_FULL_TEXT_SEARCH=true/' .dev.vars

echo ""
echo "==================================="
echo "TEST COMPLETE"
echo "==================================="
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "Question list:"
for i in "${!QUESTIONS[@]}"; do
  echo "  Q$i: ${QUESTIONS[$i]}"
done
