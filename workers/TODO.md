# TODO

## High Priority

### Implement Tracing for Chat API

**Goal**: Add comprehensive tracing to diagnose performance and resource usage in chat API calls.

**Requirements**:
- Track time spent in each step of the AI generation process
- Track time spent in each individual tool call (search_resources, search_media, getAttachment, listResources)
- Capture token usage at the end of each chat request (prompt tokens, completion tokens, total tokens)
- Use Sentry for tracing and monitoring
- Enable debugging of slow requests and optimization opportunities

**Implementation Notes**:
- AI SDK v5 provides `experimental_telemetry` metadata but may need custom spans for detailed tool-level timing
- Sentry SDK for Cloudflare Workers: `@sentry/cloudflare-workers`
- Consider adding custom Sentry spans around tool execution
- Log token usage from `result.usage` object
- Track both successful and failed requests
- Include game ID, question type, and step count in trace metadata

**Priority**: VERY IMPORTANT - Critical for diagnosing performance issues and optimizing costs

---

## Backlog

- Configure Cloudflare Email Workers for magic link authentication
- Add comprehensive test suite (Vitest for Workers)
- Production deployment guide (monitoring, rollback, etc.)
- Optimize step counts based on real-world usage patterns
- Consider caching frequently asked questions
