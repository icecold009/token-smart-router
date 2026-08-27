# Final Luna plan — Token Smart Router

Repository: `C:\Users\91829\OneDrive\Documents\GitHub\token-smart-router`
Reviewed: clean `main` at `9cf0ecd` on 2026-08-25
Feature branch: `codex/luna-router-security-contract`

## Current verified baseline

- Vite production build passes.
- No lint, unit-test, server-test, or browser-test script exists.
- Browser submit cancellation and request identity exist; provider timeout/output caps and safe public provider errors exist.

## Code-review conclusion

### Confirmed high-priority findings

1. `POST /run-tasks` is unauthenticated, is outside the `/api/route` rate limiter, reads/writes server files, and can trigger remote-provider calls. CORS is not authorization. Make the harness CLI-only or protect it with a fail-closed internal contract before any UI work.
2. Client AbortController only aborts the browser fetch. `runFireworks` creates its own controller and does not receive request disconnect/cancel state, so provider work and spend can continue.
3. Numeric environment parsing can produce `NaN`; the in-memory IP limiter has proxy/distributed/cleanup limitations; there are no tests to freeze routing, redaction, or bounds.

## Build checklist

- [ ] **1. Remove the public task-harness attack surface**
  Files: `server/index.js`, new CLI script/module, Docker/task docs.
  What to build: Prefer moving `/run-tasks` logic into a non-HTTP CLI invoked explicitly by the benchmark container. If HTTP is truly required, require an internal secret with constant-time comparison, strict origin/network controls, aggressive rate/concurrency limits, and production-disable default.
  Acceptance: An anonymous network request cannot start provider work or write a result file; task count, schema, prompt length, and output path are bounded.
  Verify: Contract tests for absent/wrong credential, oversized/malformed tasks, concurrency, safe output directory, and production-disabled behavior.

- [ ] **2. Propagate cancellation to the provider**
  Files: route handler and provider client.
  What to build: Pass one composed AbortSignal from client disconnect plus server deadline into `runFireworks`; clean listeners/timers and distinguish cancelled from timed out.
  Acceptance: Closing/cancelling the request aborts provider work promptly and a late completion cannot be returned or recorded.
  Verify: Fake provider tests asserting signal abortion for disconnect, explicit cancel contract if added, timeout, and success.

- [ ] **3. Validate configuration fail closed**
  Files: new config module, `.env.example`, startup.
  What to build: Parse finite bounded integers, exact allowed origin(s), server-only API key, HTTPS provider base URL allowlist, and non-empty model allowlist/default. Refuse invalid production config at startup.
  Acceptance: `NaN`, infinity, negative/extreme bounds, wildcard origin, arbitrary base URL, and missing remote credentials cannot start an unsafe remote route.
  Verify: Table-driven config tests with no secret values printed.

- [ ] **4. Extract and test routing/provider contracts**
  Files: route policy, local handler, provider adapter, error mapping.
  What to build: Move pure logic out of the listening server module; export deterministic policies and validate provider response/usage before rendering.
  Acceptance: Boundary prompts, empty/large input, allowlisted model, output truncation, rate limit, retryability, and redacted logging are frozen by tests.
  Verify: Add `lint`, `test`, `test:server`, and `build` scripts; run them from a clean install.

- [ ] **5. Replace the limiter's unsafe assumptions**
  Files: rate-limit middleware/config.
  What to build: Document trusted proxy settings, clean expired entries, bound memory, return `Retry-After`, add expensive-operation concurrency limits, and use shared state before claiming multi-instance enforcement.
  Acceptance: Spoofed forwarding headers do not bypass policy and the map cannot grow without bound in long-lived local mode.
  Verify: Clock-controlled tests for windows, cleanup, proxy behavior, and concurrent limits.

- [ ] **6. Make observability measured and privacy-safe**
  Files: API response, UI inspector, history.
  What to build: Show route, model, policy version/reason, estimated vs provider-reported tokens, latency, cancellation, retry count, and cost only when a configured price/version makes it calculable. Use per-run IDs.
  Acceptance: Missing usage is never exact cost; exports/history exclude secrets and allow delete-one/clear-all/local-memory-only behavior.
  Verify: Serializer/redaction tests and accessible UI tests.

- [ ] **7. Add complete request/browser tests**
  Files: server integration and browser suite.
  What to build: Cover local route, remote route, invalid input, provider auth/rate/timeout/malformed response, client cancel, disconnect, rerun confirmation, clipboard failure, history privacy, and inspector accessibility.
  Acceptance: Paid rerun requires a deliberate action and cannot duplicate during a pending request.
  Verify: `npm.cmd run lint`; `npm.cmd test`; `npm.cmd run test:server`; `npm.cmd run build`; browser suite; `git diff --check`.

- [ ] **8. Run restricted provider and operations gates**
  Files: private runbook/evidence notes.
  What to build: Use a restricted non-production key and spending cap to verify real cancellation, usage, provider outage, malformed output, and rollback. Inspect production bundle/history/logs for secrets and private prompts.
  Acceptance: Local/mock and real-provider evidence are separated; no deployment occurs without explicit approval.
  Verify: Recorded provider request IDs/cost ceiling without copying credentials or full private prompts.

## Commit checkpoints

1. `security(router): remove public task-harness execution`
2. `fix(router): propagate cancellation and validate config`
3. `test(router): cover policy bounds rate limits and redaction`
4. `feat(router): add truthful private-safe inspection`

## Definition of done

- [ ] Anonymous callers cannot trigger the task harness or server file writes.
- [ ] Client disconnect/cancel stops provider work under test.
- [ ] Configuration, routing, limits, provider responses, and redaction are schema-tested.
- [ ] Cost/usage displays distinguish estimates from measurements.
- [ ] Local, browser, and restricted-provider evidence are separately recorded.
- [ ] Feature branch is pushed and clean; `main` is untouched and unmerged.
