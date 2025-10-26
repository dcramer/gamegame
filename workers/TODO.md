# TODO

## Completed

### ✅ Implemented Sentry Tracing for Chat API

**Status**: COMPLETE

**What was implemented**:
- Installed `@sentry/cloudflare` package with Vercel AI SDK integration
- Created Sentry initialization module at `src/lib/sentry.ts`
- Integrated `vercelAIIntegration()` to automatically instrument the AI SDK
- Enabled input/output recording for prompts, tool calls, and completions
- Added metadata tags (game ID, model, environment, etc.)
- Automatic tracking of:
  - AI model calls and streaming
  - Tool executions (search_resources, search_media, listResources, getAttachment)
  - Token usage (prompt tokens, completion tokens, total tokens)
  - Step counts and finish reasons
  - Request timing and performance

**How it works**:
1. Worker is wrapped with `Sentry.withSentry()` in `worker.ts` for automatic initialization
2. The `vercelAIIntegration()` automatically captures spans from the AI SDK's `experimental_telemetry`
3. Custom tags and context are set in `chat-handler.ts` for filtering and analysis
4. No manual instrumentation needed - the AI SDK telemetry is automatically captured!
5. Sentry utilities (`setTag`, `setContext`, etc.) available in `src/lib/sentry.ts`

**Configuration**:
- Added `nodejs_als` compatibility flag to `wrangler.toml` (required for Sentry)
- Set `SENTRY_DSN` environment variable (optional - tracing disabled if not set)
- Adjust `tracesSampleRate` in `worker.ts` (currently 100%)
- Configure `recordInputs` and `recordOutputs` in `worker.ts` to control what data is captured

**Package versions**:
- `@sentry/cloudflare`: v10.22.0 (upgraded from v8.45.1)
- AI SDK v5 compatibility: Uses `inputTokens` and `outputTokens` (not `promptTokens`/`completionTokens`)

**Next steps** (if needed):
- Create Sentry project and get DSN
- Add `SENTRY_DSN` to `.dev.vars` and wrangler secrets
- Monitor traces in Sentry dashboard
- Set up alerts for slow requests or high token usage

---

## Backlog

- Configure Cloudflare Email Workers for magic link authentication
- Add comprehensive test suite (Vitest for Workers)
- Production deployment guide (monitoring, rollback, etc.)
- Optimize step counts based on real-world usage patterns
- Consider caching frequently asked questions
