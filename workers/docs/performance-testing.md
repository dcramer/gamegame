# Performance Testing Guide

This guide explains how to repeatably verify and evaluate the performance of the AI chat agent using debug instrumentation.

## Prerequisites

1. **Dev server running**
   ```bash
   pnpm dev
   ```

2. **Games with processed resources in database**
   ```bash
   # Check available games
   pnpm cli games
   ```

3. **Debug logging enabled** (see Setup section below)

## Setup

### Enable Server-Side Debug Logging (Optional)

If you need detailed server-side execution traces, add to `.dev.vars`:

```bash
# Show detailed tool call traces (tool names, arguments, results)
CHAT_DEBUG_VERBOSE=true
```

After modifying `.dev.vars`, restart the dev server:
```bash
# Kill existing server (Ctrl+C or pkill -f "pnpm dev")
pnpm dev
```

**Note:** For performance metrics, use the `--timing` flag with the CLI instead (see below).

## Running Performance Tests

### Basic Test

```bash
# In terminal 1: Watch server output
pnpm dev

# In terminal 2: Run query
pnpm cli ask <game-slug> "<question>"
```

### View Performance Metrics

```bash
# Show performance metrics in CLI output
pnpm cli ask speakeasy-2025 "How many players?" --timing

# Show detailed per-step breakdown
pnpm cli ask speakeasy-2025 "How many players?" --timing --verbose
```

This displays:
- Total duration
- Token usage (prompt, completion, reasoning)
- Tool call count and average duration
- Per-step breakdown (with --verbose)

### Measure End-to-End Latency

```bash
time pnpm cli ask speakeasy-2025 "How many players?"
```

This measures total time including:
- CLI startup
- Network request
- Server processing
- Response streaming

### Example Test Suite

```bash
# 1. Simple factual question (should use 1-2 tool calls)
pnpm cli ask speakeasy-2025 "How many players?"

# 2. Complex setup question (may use multiple tool calls)
pnpm cli ask catan-starfarers-2019 "How do I set up a 4-player game?"

# 3. Specific rule lookup (should use targeted search)
pnpm cli ask speakeasy-2025 "What happens when you roll doubles?"

# 4. Vague question (may require multiple searches)
pnpm cli ask catan-starfarers-2019 "Tell me about combat"
```

## Reading Debug Output

### CLI Output with `--timing`

```
Found game: Speakeasy
Prompt: How many players?
---

Speakeasy supports 4-8 players...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ PERFORMANCE METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Duration: 4343ms
Model: gpt-5
Steps: 2
Tool Calls: 1
Avg Tool Duration: 1834ms

Token Usage:
  Prompt:     2,193
  Completion: 220
  Reasoning:  192
  Total:      2,413
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### CLI Output with `--timing --verbose`

Adds per-step breakdown:

```
Per-Step Breakdown:
  Step 1: 2103ms, 1 tools, 2232 tokens
    - search_resources: 1834ms
  Step 2: 2240ms, 0 tools, 181 tokens
```

### Server Console Output (if CHAT_DEBUG_VERBOSE=true)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CHAT DEBUG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Game: speakeasy-2025
Model: gpt-5
Duration: 4343ms
Finish Reason: tool-calls

📋 EXECUTION TRACE

Step 1: 1 tool call(s)
  1. search_resources
     Args:
     {
       "query": "players count number of players setup",
       "resourceType": "all"
     }

     Result:
     [
       {
         "fragmentId": "...",
         "content": "2-6 players...",
         ...
       }
     ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Key Metrics

#### Timing Metrics

- **Duration**: Total server-side processing time (ms)
- **Finish Reason**: How the generation ended
  - `stop` - Normal completion
  - `tool-calls` - Ended with tool calls (likely continuing)
  - `length` - Hit token limit
  - `error` - Generation failed

#### Token Usage

- **Prompt Tokens**: Input tokens (system prompt + conversation history + tool results)
- **Completion Tokens**: Output tokens (generated text + tool calls)
- **Total Tokens**: Sum of prompt + completion
- **Reasoning Tokens**: Internal reasoning (GPT-5 only)

**Cost Estimation** (GPT-5 pricing):
- Input: $15 / 1M tokens
- Output: $60 / 1M tokens
- Reasoning: $60 / 1M tokens (billed as output)

#### Tool Call Analysis

- **Tool Name**: Which tool was called (`search_resources`, `getAttachment`, etc.)
- **Arguments**: What parameters were passed
- **Results**: What data was returned (truncated in logs)
- **Step Number**: Which roundtrip this occurred in

### Performance Targets

Based on typical queries:

| Metric | Good | Acceptable | Poor |
|--------|------|------------|------|
| Duration | < 3s | 3-6s | > 6s |
| Total Tokens | < 3000 | 3000-6000 | > 6000 |
| Tool Calls | 1-2 | 3-4 | > 5 |
| Steps | 1-2 | 3-4 | > 5 |

## Test Scenarios

### 1. Simple Factual Questions

**Goal**: Verify efficient single-shot retrieval

```bash
pnpm cli ask speakeasy-2025 "How many players?"
```

**Expected Performance**:
- Duration: < 3s
- Tool Calls: 1 (`search_resources`)
- Steps: 2 (search + response)
- Tokens: < 2500

**What to Check**:
- Search query is focused and relevant
- Only one tool call needed
- Answer directly addresses question

### 2. Multi-Step Questions

**Goal**: Verify agent can break down complex queries

```bash
pnpm cli ask catan-starfarers-2019 "How do I set up the game for 3 players?"
```

**Expected Performance**:
- Duration: 3-6s
- Tool Calls: 2-3 (multiple `search_resources` for different setup aspects)
- Steps: 3-4
- Tokens: 3000-5000

**What to Check**:
- Each tool call searches for different aspects (board setup, pieces, starting positions)
- Searches are sequential and build on each other
- Final answer synthesizes all information

### 3. Clarification Scenarios

**Goal**: Verify agent asks clarifying questions when needed

```bash
pnpm cli ask speakeasy-2025 "How do I win?"
```

**Expected Performance**:
- Duration: < 4s
- Tool Calls: 1-2
- Steps: 2-3
- Tokens: < 3500

**What to Check**:
- Agent identifies ambiguity
- Searches for victory conditions
- Provides complete answer or asks for clarification

### 4. Image/Diagram Retrieval

**Goal**: Verify agent can fetch and reference visual aids

```bash
pnpm cli ask catan-starfarers-2019 "Show me the board setup"
```

**Expected Performance**:
- Duration: 3-5s
- Tool Calls: 2-3 (`search_resources` + `getAttachment`)
- Steps: 3-4
- Tokens: 3000-4500

**What to Check**:
- Agent finds relevant images
- Uses `getAttachment` to retrieve image URLs
- Includes images in markdown response

## Optimization Checklist

Use this checklist when analyzing poor performance:

### High Duration (> 6s)

- [ ] Check search query quality - is it too broad?
- [ ] Check number of tool calls - can any be eliminated?
- [ ] Check fragment relevance - are we retrieving useful content?
- [ ] Check network latency - is Vectorize responding slowly?

### High Token Usage (> 6000)

- [ ] Check prompt size - is system prompt too large?
- [ ] Check tool results - are we returning too much data?
- [ ] Check conversation history - is it growing too large?
- [ ] Check fragment size - are chunks too long?

### Excessive Tool Calls (> 5)

- [ ] Check if agent is searching repeatedly for same info
- [ ] Check if search queries are too specific/narrow
- [ ] Check if agent is exploring multiple unrelated topics
- [ ] Check if tool results contain sufficient information

### Poor Answer Quality

- [ ] Check if search results are relevant
- [ ] Check if agent is using tool results in answer
- [ ] Check if fragments contain necessary information
- [ ] Check if prompt instructions are clear

## Benchmarking

### Create a Benchmark Suite

Save common test queries to a file:

```bash
# benchmark-queries.txt
speakeasy-2025|How many players?
speakeasy-2025|What is the goal?
speakeasy-2025|How do you move?
catan-starfarers-2019|How do I set up for 4 players?
catan-starfarers-2019|What resources can I collect?
catan-starfarers-2019|How does trading work?
```

### Run Benchmark Script

```bash
# Run all queries and log results
while IFS='|' read -r game question; do
  echo "Testing: $game - $question"
  time pnpm cli ask "$game" "$question"
  echo "---"
done < benchmark-queries.txt > benchmark-results.txt 2>&1
```

### Extract Metrics

```bash
# Extract timing data from server logs
grep "Duration:" ~/.wrangler/logs/wrangler-*.log

# Extract token usage
grep -A 3 "Token Usage:" ~/.wrangler/logs/wrangler-*.log
```

## Comparing Performance Changes

### Before/After Testing

1. **Establish Baseline**
   ```bash
   # Run benchmark with current implementation
   ./run-benchmark.sh > baseline-results.txt
   ```

2. **Make Changes** (e.g., modify prompt, adjust search, change model)

3. **Run Comparison**
   ```bash
   # Run benchmark with new implementation
   ./run-benchmark.sh > comparison-results.txt
   ```

4. **Compare Results**
   ```bash
   # Compare token usage
   diff <(grep "Total:" baseline-results.txt) <(grep "Total:" comparison-results.txt)

   # Compare durations
   diff <(grep "Duration:" baseline-results.txt) <(grep "Duration:" comparison-results.txt)
   ```

### Metrics to Track

Create a spreadsheet or table tracking:

| Date | Change | Avg Duration | Avg Tokens | Avg Tool Calls | Quality Score |
|------|--------|--------------|------------|----------------|---------------|
| 2025-10-26 | Baseline | 4.2s | 3200 | 2.1 | 8/10 |
| 2025-10-27 | New prompt | 3.8s | 2900 | 1.9 | 9/10 |

## Troubleshooting

### Debug Output Not Appearing

1. Check `.dev.vars` has debug flags set
2. Restart dev server after modifying `.dev.vars`
3. Verify server console shows debug variables loaded
4. Check server logs for error messages

### Inconsistent Performance

- **Network issues**: Vectorize remote connection may vary
- **Cache effects**: First query may be slower (cold start)
- **Database state**: Ensure consistent test data
- **Model variance**: LLM responses naturally vary

**Solution**: Run each test 3 times and average results

### High Token Usage on Simple Questions

- Check if conversation history is being included
- Check if system prompt is too large
- Check if tool results are too verbose
- Consider implementing result truncation

## Advanced Analysis

### Export Structured Logs

For deeper analysis, export debug logs to JSON:

```bash
# Extract debug blocks from server logs
grep -A 100 "🔍 CHAT DEBUG" wrangler-*.log | \
  awk '/Duration:/ {duration=$2} /Total:/ {tokens=$2} /tool call/ {calls++} END {print duration, tokens, calls}'
```

### Sentry Performance Monitoring

If `SENTRY_DSN` is configured, view detailed traces at:
- Dashboard: https://sentry.io
- Filter by: `game_id`, `model`, `environment`
- Metrics: Request duration, token usage, error rates

### Statistical Analysis

For rigorous testing:

1. **Run 10+ samples per query**
2. **Calculate mean, median, std dev**
3. **Identify outliers**
4. **Test for statistical significance** (t-test for before/after comparisons)

Example Python script:
```python
import statistics

durations = [4.3, 4.1, 4.5, 3.9, 4.2, 4.4, 4.0, 4.3, 4.1, 4.2]

print(f"Mean: {statistics.mean(durations):.2f}s")
print(f"Median: {statistics.median(durations):.2f}s")
print(f"Std Dev: {statistics.stdev(durations):.2f}s")
print(f"Min: {min(durations):.2f}s")
print(f"Max: {max(durations):.2f}s")
```

## Continuous Monitoring

### Development Workflow

1. **Before making changes**: Run benchmark, save results
2. **Make incremental changes**: One at a time
3. **Test each change**: Run relevant queries
4. **Compare metrics**: Look for improvements/regressions
5. **Iterate**: Keep improvements, revert regressions

### Production Monitoring

For production deployments:

1. **Use Sentry**: Monitor real user performance
2. **Set up alerts**: Notify on performance degradation
3. **Track trends**: Monitor metrics over time
4. **A/B test**: Compare different implementations

## Additional Resources

- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [OpenAI Token Pricing](https://openai.com/pricing)
- [Vectorize Documentation](https://developers.cloudflare.com/vectorize/)
