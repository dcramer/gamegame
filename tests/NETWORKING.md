# Test networking

Vitest now boots with a global [MSW](https://mswjs.io/) server (see `tests/mocks/network.ts`) that intercepts every `http`/`https` request. Any call that isn't explicitly mocked or allowed will throw so we never hit external services such as OpenAI during unit tests.

## Default behaviour

- Requests to `localhost`, `127.0.0.1`, and `[::1]` are allowed so local helpers (e.g. the test Postgres instance) can still be reached.
- Everything else is blocked unless a test opts in.
- `networkServer.resetHandlers()` is run after every test so mocks stay isolated.
- OpenAI chat + embeddings endpoints have baseline handlers so most tests can run without extra setup. Override them by calling `networkServer.use(...)` in your test when you need custom behaviour.

## Adding mocks

```ts
import { http, HttpResponse, networkServer } from '@/tests/mocks/network';

networkServer.use(
  http.post('https://api.openai.com/v1/chat/completions', () =>
    HttpResponse.json({ choices: [] }),
  ),
);
```

## Allowing specific domains

If a test truly needs to talk to a live endpoint, call `allowNetworkRequests` at the start of the test. The allow-list resets between tests, so the opt-in is always local.

```ts
import { allowNetworkRequests } from '@/tests/mocks/network';

test('talks to in-cluster dev service', async () => {
  allowNetworkRequests({ hosts: 'my-dev-service.internal' });

  await makeRealCall();
});
```

You can also allow by URL prefix or regex:

```ts
allowNetworkRequests({
  urls: [/^https:\/\/.*\.internal\.example\.com/],
});
```
