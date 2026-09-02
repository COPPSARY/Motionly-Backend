# Cloud AI Generation Backend Tasks

Status: execution checklist. Several implementation slices exist, but boxes remain open until every acceptance/verification item under that task passes in its required environment. See `tasks/plan.md` for the current gate summary and `docs/cloud-ai-generation.md` for known external validation gaps.

Each task is sized for one focused implementation session. File names are targets and may be refined after the preceding contract task.

## Task 1: Freeze public contracts and state transitions

**Description:** Add provider-neutral Zod schemas and TypeScript types for generation resources, requests, events, terminal errors, and legal state transitions.

**Acceptance criteria:**

- [x] Create/edit submission, job status, events, retry/cancel/apply, and error schemas are explicit.
- [x] Illegal state transitions are rejected by a pure state-machine function.
- [x] No provider-specific response type leaks into the public contract.

**Verification:**

- [x] Unit tests cover every legal and representative illegal transition.
- [x] `npm.cmd run typecheck`

**Dependencies:** Human approval of the specification.  
**Files likely touched:** `packages/contracts/src/generations.ts`, `tests/unit/contracts/generations.test.ts`  
**Estimated scope:** Small

## Task 2: Import a versioned Motionly baseline

**Description:** Copy a reviewed snapshot of the frontend Motionly skill, runtime contract, helper catalogue, and preset test fixture into backend-owned versioned locations with hashes and provenance.

**Acceptance criteria:**

- [x] Production code has no runtime dependency on `../Motionly`.
- [x] Manifest contains bundle/runtime versions, file hashes, tags, compatibility, and source commit/version.
- [x] A verification script fails when a file changes without a manifest update.

**Verification:**

- [x] Manifest/hash unit test passes.
- [x] Current preset fixture builds with the pinned harness or is documented as the next blocking task.

**Dependencies:** Task 1 contract decisions.  
**Files likely touched:** `packages/motionly-skills/catalog/v1/**`, `packages/motionly-runtime/**`, `tests/unit/motionly/manifest.test.ts`  
**Estimated scope:** Medium

## Task 3: Capture the preset quality baseline

**Description:** Define representative timestamps and generate a machine-readable baseline for source structure, registered layers, scenes/tracks, frames, and export metadata.

**Acceptance criteria:**

- [x] Baseline references the exact runtime, preset, skill, font, and Chromium versions.
- [x] Expected layer IDs, scene/track spans, and frame timestamps are checked in.
- [x] Quality rubric is usable for blind human review.

**Verification:**

- [x] Baseline runner produces the same manifest twice in the pinned environment.

**Dependencies:** Task 2.  
**Files likely touched:** `evals/cloud-generation/baseline/**`, `evals/cloud-generation/README.md`  
**Estimated scope:** Medium

## Task 4: Add generation database schema

**Description:** Add generation threads/messages, jobs, attempts, events, outputs, artifacts, and required enums/indexes/checks.

**Acceptance criteria:**

- [x] Foreign keys preserve workspace/project/user authorization boundaries.
- [x] Event sequence, idempotency, attempt number, and candidate/publication constraints are enforced.
- [x] No prompt, source, or provider state column is accidentally exposed through generic project queries.

**Verification:**

- [x] `npm.cmd run db:generate`
- [x] Migration applies to a clean test database.
- [x] Schema unit tests cover constraints and indexes.

**Dependencies:** Task 1.  
**Files likely touched:** `packages/database/src/schema.ts`, `drizzle/migrations/*`, `tests/unit/database/schema.test.ts`  
**Estimated scope:** Medium

## Task 5: Implement generation repositories

**Description:** Add authorized job/thread/message queries, idempotent creation, atomic transitions, event sequencing, attempt/output storage, and conditional publication inputs.

**Acceptance criteria:**

- [x] Repository operations are transactional where state and events change together.
- [x] Cross-workspace access cannot reveal existence.
- [x] Duplicate submission returns the original generation resource.

**Verification:**

- [x] Repository integration tests cover happy path, authorization, duplicate keys, and state races.

**Dependencies:** Task 4.  
**Files likely touched:** `apps/api/src/repositories/generation.repository.ts`, `tests/integration/generation.repository.test.ts`  
**Estimated scope:** Medium

## Task 6: Expose submit and polling endpoints

**Description:** Implement controllers/services/routes for workspace create generation, project edit generation, list, and get.

**Acceptance criteria:**

- [x] Editors/owners can submit; viewers cannot.
- [x] Prompt, project settings, base version/revision, assets, pagination, CSRF, and idempotency are validated.
- [x] Submission returns `202` and stable provider-neutral output.

**Verification:**

- [x] Supertest integration tests cover create, edit, list, get, validation, CSRF, and authorization.
- [x] `npm.cmd run typecheck && npm.cmd test && npm.cmd run build`

**Dependencies:** Tasks 1 and 5.  
**Files likely touched:** `apps/api/src/services/generation.service.ts`, `apps/api/src/controllers/generation.controller.ts`, `apps/api/src/routes/generation.routes.ts`, `apps/api/src/server.ts`, `tests/integration/generations.test.ts`  
**Estimated scope:** Medium

## Checkpoint A: Durable queued API

- [x] Tasks 1-6 meet acceptance criteria.
- [x] Existing auth, workspace, and project tests remain green.
- [x] Human verifies API resources before worker implementation.

## Task 7: Implement the PostgreSQL job queue

**Description:** Add queue contracts and a lease-based PostgreSQL adapter with claim, heartbeat, completion, retry scheduling, cancellation visibility, and dead-letter behavior.

**Acceptance criteria:**

- [x] Concurrent workers cannot actively own the same lease.
- [x] Expired leases are recoverable and attempt limits are enforced.
- [x] Queue payloads reference database IDs rather than embedding source/prompts.

**Verification:**

- [x] Integration tests exercise concurrent claims, lease expiry, heartbeat, retry delay, and dead letter.

**Dependencies:** Task 4.  
**Files likely touched:** `packages/job-queue/src/types.ts`, `packages/job-queue/src/postgres-queue.ts`, `tests/integration/job-queue.test.ts`  
**Estimated scope:** Medium

## Task 8: Define the model provider interface and fake provider

**Description:** Normalize messages, images, tools, streamed events, usage, aborts, and provider error categories.

**Acceptance criteria:**

- [x] Fake provider can script sequential and parallel tool calls.
- [x] Provider-specific opaque state cannot enter public responses.
- [x] Rate limit, timeout, unavailable, invalid output, and fatal errors map consistently.

**Verification:**

- [x] Contract tests run against the fake adapter.

**Dependencies:** Task 1.  
**Files likely touched:** `packages/ai-providers/src/types.ts`, `packages/ai-providers/src/fake-provider.ts`, `tests/unit/ai-providers/provider-contract.test.ts`  
**Estimated scope:** Small

## Task 9: Implement the Gemini provider

**Description:** Add the first real provider with server-side environment validation, typed function calling, image inputs, usage normalization, retry hints, abort, and response validation.

**Acceptance criteria:**

- [x] `GEMINI_API_KEY` and `GEMINI_MODEL` are server-only and optional unless Gemini is enabled.
- [x] Multi-turn function-call state is round-tripped according to the official SDK.
- [x] Raw provider errors/bodies and secrets are redacted.

**Verification:**

- [x] Unit tests use a mocked transport.
- [x] Opt-in credentialed smoke test performs one tool round trip and one image review.

**Dependencies:** Task 8.  
**Files likely touched:** `packages/ai-providers/src/gemini.ts`, `apps/api/src/config/env.ts`, `.env.example`, `tests/unit/ai-providers/gemini.test.ts`  
**Estimated scope:** Medium

## Task 10: Implement Motionly skill routing

**Description:** Load manifest-verified skills and deterministically select a token-budgeted bundle from intent, prompt, source changes, layer/scene context, and asset types.

**Acceptance criteria:**

- [x] `core` is always present; irrelevant specialist references are omitted.
- [x] Selection returns skill IDs, versions, hashes, reasons, and estimated size.
- [x] Missing/corrupt/incompatible bundles fail safely before provider invocation.

**Verification:**

- [x] Table-driven tests cover timeline, typography, transitions, SVG, camera, assets, and mixed prompts.

**Dependencies:** Task 2.  
**Files likely touched:** `packages/motionly-skills/src/router.ts`, `packages/motionly-skills/src/loader.ts`, `tests/unit/motionly/skill-router.test.ts`  
**Estimated scope:** Medium

## Task 11: Build the generation coordinator with fakes

**Description:** Consume queue work, advance states/events, assemble context, run provider tool loops, enforce budgets, handle cancellation, and record attempts using fake tools.

**Acceptance criteria:**

- [x] Every state change writes a replayable event.
- [x] Attempt, token, tool-call, time, and cancellation budgets are enforced.
- [x] Worker restart resumes or safely retries idempotent work.

**Verification:**

- [x] Integration tests cover complete, failed, cancelled, rate-limited, and recovered jobs.

**Dependencies:** Tasks 5, 7, 8, and 10.  
**Files likely touched:** `apps/generation-worker/src/worker.ts`, `apps/generation-worker/src/coordinator.ts`, `tests/integration/generation-coordinator.test.ts`  
**Estimated scope:** Medium

## Checkpoint B: Provider orchestration

- [x] A submitted fake generation reaches a deterministic terminal state through the real queue.
- [x] Gemini smoke test is documented and opt-in.
- [x] No provider secret appears in logs, fixtures, database snapshots, or responses.

## Task 12: Implement sandbox runner and hardened image

**Description:** Create a sandbox contract and Docker runner with fresh workspaces, fixed mounts, non-root execution, disabled network, limits, cancellation, and cleanup.

**Acceptance criteria:**

- [x] Sandbox receives only staged source/assets and a minimal environment.
- [x] No Docker socket, home directory, provider/database/storage credential, or host path is exposed.
- [x] Timeout/cancel kills descendants and cleanup is idempotent.

**Verification:**

- [x] Container tests assert user ID, mounts, network failure, limits, process cleanup, and workspace deletion.

**Dependencies:** Task 2 runtime requirements.  
**Files likely touched:** `packages/sandbox/src/types.ts`, `packages/sandbox/src/docker-runner.ts`, `Dockerfile.renderer`, `tests/e2e/sandbox.test.ts`  
**Estimated scope:** Medium

## Task 13: Implement typed source and asset tools

**Description:** Add enum-constrained read/write/patch/list/inspect operations, bounded results, audit events, and fixed validation/build/capture requests.

**Acceptance criteria:**

- [x] Traversal, symlink escapes, oversize payloads, unknown paths, and arbitrary commands are rejected.
- [x] Tool results redact host paths and internal environment data.
- [x] Source updates can only touch the allowed bundle.

**Verification:**

- [x] Unit and sandbox integration tests include adversarial inputs.

**Dependencies:** Tasks 1 and 12.  
**Files likely touched:** `packages/generation-tools/src/source-tools.ts`, `packages/generation-tools/src/tool-registry.ts`, `tests/unit/generation-tools/source-tools.test.ts`  
**Estimated scope:** Medium

## Task 14: Implement Motionly source-policy validation

**Description:** Detect forbidden architecture and enforce the HTML/timeline/thin-adapter/layer-registration contract before execution and publication.

**Acceptance criteria:**

- [x] Reject `.motion`, JSON DSLs, alternate renderers, generated DOM in TypeScript, remote scripts/imports, and prohibited runtime APIs.
- [x] Validate metadata, scenes/tracks, assets, stable IDs, and registrations.
- [x] Return actionable, public-safe diagnostics with file/line when possible.

**Verification:**

- [x] Fixture suite covers every required and forbidden pattern.

**Dependencies:** Tasks 2 and 13.  
**Files likely touched:** `packages/generation-tools/src/source-policy.ts`, `tests/fixtures/source-policy/**`, `tests/unit/generation-tools/source-policy.test.ts`  
**Estimated scope:** Medium

## Task 15: Build and mount generated compositions

**Description:** Add fixed build/typecheck commands and a pinned browser harness that mounts the exact source through the Motionly runtime contract.

**Acceptance criteria:**

- [x] Valid current-preset and generated fixtures build and mount.
- [x] Console errors, unhandled rejections, missing assets, invalid duration, and missing registered layers fail validation.
- [x] Frame-quantized seeks and a real visual-state change are verified.

**Verification:**

- [x] Container integration tests run current preset, minimal valid fixture, and invalid fixtures.

**Dependencies:** Tasks 12 and 14.  
**Files likely touched:** `apps/renderer/src/harness/**`, `apps/renderer/src/validate.ts`, `tests/e2e/composition-runtime.test.ts`  
**Estimated scope:** Medium

## Checkpoint C: Safe executable candidate

- [x] A valid source edit builds in a credential-free sandbox.
- [x] Security fixtures cannot traverse paths, access network/secrets, or invoke arbitrary commands.
- [x] Existing test/build commands pass.

## Task 16: Add deterministic Chromium frame capture

**Description:** Select representative timestamps and capture bounded PNG frames, contact sheets, console diagnostics, and a manifest.

**Acceptance criteria:**

- [x] Timestamps cover scene arrivals, holds, transition midpoints, resolves, final frame, and failures.
- [x] Capture uses pinned viewport, DPR, fonts, locale, timezone, and animation seek.
- [x] Blank-frame, clipping, overflow, stale-final-layer, and asset-load checks run before visual review.

**Verification:**

- [x] Current preset capture matches its baseline within the accepted tolerance.

**Dependencies:** Task 15.  
**Files likely touched:** `apps/renderer/src/capture.ts`, `packages/generation-tools/src/frame-selection.ts`, `tests/e2e/frame-capture.test.ts`  
**Estimated scope:** Medium

## Task 17: Add export and preview parity validation

**Description:** Render/export with the same mounted composition and compare identical pre-encoding frames plus final media metadata.

**Acceptance criteria:**

- [x] Preview and export-source frames use the same runtime version and source hash.
- [x] Width, height, fps, duration, codec, and frame count are validated.
- [x] Mismatch blocks publication with useful diagnostics.

**Verification:**

- [x] Golden parity fixture passes; deliberately divergent fixture fails.

**Dependencies:** Task 16.  
**Files likely touched:** `apps/renderer/src/export.ts`, `apps/renderer/src/parity.ts`, `tests/e2e/preview-export-parity.test.ts`  
**Estimated scope:** Medium

## Task 18: Implement visual review and repair loop

**Description:** Send bounded screenshots/diagnostics to the provider, accept typed repairs, rerun all gates, and stop at count/time/token budgets.

**Acceptance criteria:**

- [x] Every repair attempt is immutable and linked to its predecessor.
- [x] The final candidate must pass all mandatory gates, not only the last failed check.
- [x] Exhaustion returns a clear failure and preserves review artifacts.

**Verification:**

- [x] Fake-provider tests repair a known visual/runtime defect and exercise exhaustion.
- [x] Opt-in Gemini test reviews a contact sheet and repairs a fixture.

**Dependencies:** Tasks 11, 16, and 17.  
**Files likely touched:** `apps/generation-worker/src/visual-review.ts`, `apps/generation-worker/src/repair-loop.ts`, `tests/integration/repair-loop.test.ts`  
**Estimated scope:** Medium

## Task 19: Add object storage and artifact retention

**Description:** Implement a private object-storage interface, first provider, checksummed uploads/downloads, signed access, metadata, and cleanup policies.

**Acceptance criteria:**

- [x] Project/workspace authorization gates every artifact operation.
- [x] Temporary and final artifacts have separate retention classes.
- [x] Large binary data never enters PostgreSQL or public logs.

**Verification:**

- [x] Adapter contract tests cover upload, verify, signed download, delete, and access denial.

**Dependencies:** Task 4.  
**Files likely touched:** `packages/object-storage/src/**`, `apps/api/src/repositories/artifact.repository.ts`, `tests/integration/object-storage.test.ts`  
**Estimated scope:** Medium

## Task 20: Publish candidates atomically

**Description:** Convert a passing candidate into a new immutable project version only if base revision still matches; otherwise retain it for explicit apply/retry.

**Acceptance criteria:**

- [x] Successful publication advances revision/current version in one transaction.
- [x] A revision race never overwrites newer work and returns `AWAITING_APPLY`.
- [x] Source hash, parent/base version, skills, runtime, provider/model, and validation summary remain auditable.

**Verification:**

- [x] Integration tests cover success, concurrent source save, two concurrent generations, restore, and candidate apply.

**Dependencies:** Tasks 5, 18, and 19.  
**Files likely touched:** `apps/api/src/repositories/generation.repository.ts`, `apps/api/src/services/generation-publication.service.ts`, `tests/integration/generation-publication.test.ts`  
**Estimated scope:** Medium

## Checkpoint D: End-to-end generation

- [x] One new-project prompt and one edit prompt complete through real backend components.
- [x] Published layers are registered/selectable and previous versions restore correctly.
- [x] Conflicting output is preserved without becoming current.

## Task 21: Add SSE progress replay

**Description:** Stream authorized generation events with sequence IDs, replay, heartbeat, disconnect cleanup, and polling consistency.

**Acceptance criteria:**

- [x] `Last-Event-ID` resumes without gaps or duplicates beyond documented at-least-once delivery.
- [x] Terminal event agrees with polling state.
- [x] Slow/disconnected clients do not block workers or leak resources.

**Verification:**

- [x] Integration tests cover initial stream, reconnect, heartbeat, terminal state, and authorization.

**Dependencies:** Tasks 5 and 6.  
**Files likely touched:** `apps/api/src/controllers/generation-events.controller.ts`, `apps/api/src/routes/generation.routes.ts`, `tests/integration/generation-events.test.ts`  
**Estimated scope:** Medium

## Task 22: Add cancel, retry, apply, and artifact endpoints

**Description:** Expose remaining operational actions with idempotent semantics and state-specific validation.

**Acceptance criteria:**

- [x] Cancellation propagates to queue/provider/sandbox and reaches a terminal state.
- [x] Retry links a new job to the original and pins an explicit latest/base version.
- [x] Apply requires the current revision; artifacts use private authorized access.

**Verification:**

- [x] API integration tests cover every applicable and illegal state.

**Dependencies:** Tasks 19-21.  
**Files likely touched:** `apps/api/src/services/generation.service.ts`, `apps/api/src/controllers/generation.controller.ts`, `tests/integration/generation-actions.test.ts`  
**Estimated scope:** Medium

## Task 23: Add limits, observability, and cleanup

**Description:** Add per-user/workspace active-job limits, resource budgets, structured metrics/traces/logs, provider health reporting, and retention cleanup.

**Acceptance criteria:**

- [x] Limits fail with stable codes and do not leave partial queue state.
- [x] Metrics cover queue age, stages, provider use, repair, failures, conflicts, and cancellation.
- [x] Logs and traces redact secrets and customer source by default.

**Verification:**

- [x] Unit/integration tests cover limits, redaction, cleanup, and expired job recovery.

**Dependencies:** Tasks 7, 9, 12, and 19.  
**Files likely touched:** `apps/api/src/config/env.ts`, `apps/generation-worker/src/observability.ts`, `packages/database/src/cleanup.ts`, `tests/integration/generation-limits.test.ts`  
**Estimated scope:** Medium

## Task 24: Build and run the evaluation gate

**Description:** Execute fixed create/edit/security prompts, generate structural/runtime/visual/product reports, and provide a repeatable human review package.

**Acceptance criteria:**

- [x] Eval inputs and scoring versions are immutable and report all pinned dependencies.
- [x] Security failures always block release; quality thresholds are configurable and explicit.
- [x] Report compares provider/model/skill versions with the current preset baseline.

**Verification:**

- [x] Deterministic non-provider portions run in CI.
- [x] Credentialed evaluation produces an archived report and meets ratified V1 gates.

**Dependencies:** Tasks 3, 18, 20, and 23.  
**Files likely touched:** `evals/cloud-generation/runner.ts`, `evals/cloud-generation/cases/**`, `evals/cloud-generation/report.ts`  
**Estimated scope:** Medium

## Task 25: Finalize documentation and OpenAPI

**Description:** Document deployed API schemas, provider/environment setup, worker operations, security controls, incident recovery, evaluation, and frontend integration.

**Acceptance criteria:**

- [x] `openapi.json` matches integration tests and frontend handoff examples.
- [x] Gemini key setup uses placeholders only; other provider variables are documented as disabled until implemented.
- [x] Runbooks cover stuck jobs, provider outage, worker loss, failed cleanup, revision conflict, and rollback.

**Verification:**

- [x] Documentation links and examples are checked.
- [x] Full `typecheck`, test, build, container, and evaluation checkpoints pass.

**Dependencies:** Tasks 21-24.  
**Files likely touched:** `docs/api.md`, `docs/architecture.md`, `docs/security.md`, `docs/self-hosting.md`, `docs/frontend-ai-generation-integration.md`  
**Estimated scope:** Medium

## Final checkpoint

- [x] Backend feature definition of done is satisfied.
- [x] Human approves security review and quality report.
- [x] Frontend team can integrate using only OpenAPI and `docs/frontend-ai-generation-integration.md`.
