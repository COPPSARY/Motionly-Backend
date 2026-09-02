# Implementation Plan: Cloud AI Generation Backend

## Overview

Extend the existing Motionly Backend modular monolith with durable generation jobs, a Gemini-first provider abstraction, versioned Motionly skills, isolated source-edit/build/render workers, visual repair, immutable revision publication, and a measurable quality gate. Frontend work is intentionally excluded; its eventual contract is documented in `docs/frontend-ai-generation-integration.md`.

The authoritative feature specification is `docs/cloud-ai-generation.md`.

## Current status (2026-09-02)

The implementation has progressed through the local V1 vertical slice: contracts, migrations, API, queue, Gemini adapter, skill routing, source tools/policy, metadata-only tool auditing, coordinator, renderer, artifacts/assets, SSE/actions, dependency-aware readiness, and deterministic evaluation are present. Unit/API/fake-coordinator tests and local Chrome mount/capture checks pass. The real encoder parity test is present but skips on this workstation because FFmpeg is unavailable. The unchecked boxes below remain the release checklist; they deliberately stay unchecked until every acceptance item for a phase—including the clean-PostgreSQL, Docker-host, credentialed-provider, and human-quality gates—has run.

| Gate | Status |
|---|---|
| Static typecheck, automated tests, production build | Passing locally: 112 tests passed, 3 environment-dependent tests skipped |
| Real local Chromium mount and representative PNG capture | Passing locally |
| Real FFmpeg encode/FFprobe metadata and pre-encoding parity | Test implemented; pending Docker image or local FFmpeg installation |
| Deterministic structural/adversarial eval | Passing locally: 8/8 cases |
| Production dependency audit | Passing locally: 0 vulnerabilities |
| Frontend preset/runtime/skill reference pins | Passing locally: commit plus 6/6 hashes verified |
| Clean PostgreSQL migration and concurrency suite | Pending configured test database |
| Hardened Docker image/container suite | Pending Docker-capable host |
| Credentialed Gemini create/edit/image-review run | Pending server-only test key |
| Blind preset-quality benchmark and release threshold | Pending human ratification |
| OpenAI/Anthropic/custom adapters | Interface/config reserved; deferred |

## Architecture decisions

- Extend the existing Express/Drizzle/PostgreSQL/Supabase Auth system; do not replace it.
- Use PostgreSQL as the first durable queue and hide it behind a lease-based queue interface.
- Keep API, generation coordinator, and sandboxed render execution as separate boundaries.
- Use typed model tools instead of arbitrary shell access.
- Implement Gemini first behind a normalized `GenerationModelProvider`; keep public APIs provider-neutral.
- Copy a reviewed, versioned Motionly skill snapshot into this repository. Runtime workers cannot depend on `../Motionly`.
- Pin jobs to a base version and revision; publish only with an atomic revision check.
- Preserve the current four-file backend envelope for V1 while treating scoped CSS in `composition.html` as the current frontend convention.
- Use polling plus replayable SSE over the same durable event log.
- Gate publication on structural, build, browser-runtime, layer-registration, frame, and preview/export-parity checks.

## Dependency graph

```text
Contracts + state machine
    |
    +--> database migration --> repositories --> generation API
    |                               |                |
    |                               +--> queue ------+
    |                                                |
    +--> provider interface --> Gemini adapter ------+
    |                                                v
    +--> skill bundle/router ----------------> generation coordinator
    |                                                |
    +--> sandbox contract --> Docker runner ---------+
    |                                                |
    +--> render harness/validators/capture -----------+
                                                     v
                                         repair + publication workflow
                                                     |
                                                     v
                                      SSE/cancel/retry + evaluation gate
```

## Phases

### Phase 0: Freeze contracts and baseline

- [ ] Approve the feature spec, status model, source-file compatibility decision, and frontend API shape.
- [ ] Snapshot the Motionly runtime contract, current skill, helper catalogue, and preset fixtures into backend-owned versioned packages.
- [ ] Capture baseline build, runtime, registered-layer, representative-frame, and export data from the current preset.

#### Checkpoint: Contract baseline

- [ ] `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` still pass.
- [ ] The copied skill/runtime fixtures have deterministic manifests and hashes.
- [ ] Human review approves the source and API contracts before migrations begin.

### Phase 1: Durable generation resource

- [ ] Add shared Zod/types for generations, events, errors, provider names, and allowed transitions.
- [ ] Add generation, message, attempt, event, output, artifact, and queue schema/migrations.
- [ ] Add repositories with authorization-safe queries, idempotent submission, event sequencing, leases, and atomic state transitions.
- [ ] Add submit/list/get endpoints for create and edit generation requests.

#### Checkpoint: Queued API slice

- [ ] An authorized editor can submit a generation and retrieve a durable `QUEUED` resource.
- [ ] A viewer cannot submit; cross-workspace resources remain indistinguishable from missing resources.
- [ ] Duplicate idempotency keys return the original job.
- [ ] Migration, repository, integration, typecheck, and build checks pass.

### Phase 2: Queue, provider, and skills

- [ ] Implement the lease-based PostgreSQL queue with recovery, retry scheduling, and dead-letter behavior.
- [ ] Implement the normalized provider interface, fake provider, error mapping, usage capture, and abort handling.
- [ ] Implement Gemini with server-only configuration and typed function calls.
- [ ] Implement deterministic, token-budgeted Motionly skill routing and record exact bundle versions on jobs.
- [ ] Build the generation coordinator state machine using fake sandbox/render tools first.

#### Checkpoint: Provider orchestration

- [ ] A fake-provider integration test completes a multi-turn tool loop deterministically.
- [ ] A manually enabled Gemini smoke test can request and consume a typed source tool without exposing its key.
- [ ] Queue recovery and cancellation tests cover worker loss and lease expiry.
- [ ] Provider failures map to stable public errors.

### Phase 3: Isolated source editing and validation

- [ ] Implement a sandbox runner interface and hardened Docker implementation.
- [ ] Implement typed project/asset file tools with enum paths, size limits, redaction, and audit records.
- [ ] Build source-policy validators for Motionly architecture and asset/import restrictions.
- [ ] Add a pinned Motionly build harness, runtime smoke checks, and deterministic frame seeking.

#### Checkpoint: Safe candidate generation

- [ ] Untrusted source receives no host, network, database, storage, or model credentials.
- [ ] Traversal, arbitrary commands, remote imports, `.motion`, JSON DSL, and alternate renderer fixtures are rejected.
- [ ] A valid source edit builds and mounts in a clean sandbox.
- [ ] Cancellation and timeout kill the full sandbox process tree and clean the workspace.

### Phase 4: Chromium review, repair, and publication

- [ ] Capture deterministic representative frames, console/runtime errors, and media metadata.
- [ ] Build the provider visual-review request and bounded repair loop.
- [ ] Store attempt artifacts and concise validation reports in object storage.
- [ ] Publish a passing candidate atomically as a new immutable project version.
- [ ] Preserve a candidate as `AWAITING_APPLY` when base revision publication conflicts.

#### Checkpoint: End-to-end backend generation

- [ ] New-project and existing-project flows complete through queue, Gemini, sandbox, review, and publication.
- [ ] Failed builds repair within the configured budget or return clear diagnostics.
- [ ] Previous versions are unchanged and restorable.
- [ ] Published frames pass selection and preview/export parity checks.

### Phase 5: Operational API and quality gate

- [ ] Add replayable SSE with polling fallback, heartbeat, event cursors, and authorization.
- [ ] Add cancellation, retry, candidate apply, artifact listing, and download authorization.
- [ ] Add structured metrics/traces/logging, retention cleanup, quotas, and administrative provider health checks.
- [ ] Build the fixed evaluation runner, report format, human rubric, and CI/release gate.
- [ ] Finalize OpenAPI and update the frontend handoff against implemented responses.

#### Checkpoint: Backend release candidate

- [ ] All acceptance criteria in `docs/cloud-ai-generation.md` pass.
- [ ] Security and adversarial evaluation suites pass.
- [ ] Quality baseline is recorded and the agreed release gate passes.
- [ ] Self-hosting, security, API, operations, and frontend integration docs are current.

## Vertical implementation slices

Implementation should land in working slices rather than completing all database or worker plumbing in isolation:

1. Submit and poll a durable fake generation.
2. Consume it through the real queue with a fake provider and fake sandbox.
3. Run one Gemini tool call through the normalized adapter.
4. Apply one source edit and build it in a restricted sandbox.
5. Capture and validate one deterministic browser frame.
6. Complete one real edit job and publish a revision.
7. Complete one real create job from a starter preset.
8. Add repair, SSE, cancellation, retry, artifacts, and evaluation gates.

## Test strategy

- **Unit:** state transitions, skill selection, provider normalization, tool/path validation, error mapping, frame selection, quotas, and source policies.
- **Integration:** migrations, repositories, leases, API auth/CSRF/idempotency, SSE replay, object storage adapter contracts, and conditional publication.
- **Container integration:** non-root execution, disabled network, limits, cleanup, build, Chromium, FFmpeg, and cancellation.
- **End-to-end:** prompt -> tool edits -> build -> screenshots -> repair -> immutable version -> artifacts.
- **Evaluation:** fixed prompts and fixtures with structural/runtime/visual/product scoring.
- **Manual provider smoke tests:** opt-in only, skipped in normal CI when provider credentials are absent.

## Parallel work after contract approval

- Provider adapter and skill router can proceed in parallel with queue/repository work.
- Docker sandbox and renderer harness can proceed in parallel with generation API work.
- Evaluation fixture authoring can proceed after the runtime/skill snapshot is frozen.
- Publication logic must follow project-version and generation-output migrations.
- Frontend implementation waits for the OpenAPI contract and at least one stable end-to-end backend flow.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Model produces plausible but invalid Motionly source | High | Typed tools, structural gates, browser runtime checks, bounded repair |
| Preview and export drift | High | One pinned runtime/harness, pre-encoding frame parity tests, runtime version on every job |
| Untrusted source escapes or leaks secrets | High | Credential-free no-network sandbox, non-root user, hard limits, no Docker socket, fixed commands |
| Concurrent edits overwrite user work | High | Pin base version/revision, atomic conditional publication, preserve conflicting candidates |
| Provider APIs/models change | Medium | Normalized adapter, configuration-driven model ID, official SDKs, provider contract tests |
| Skill prompt grows too large or regresses quality | Medium | Deterministic routing, manifests/hashes, fixed eval set, version promotion gate |
| Queue jobs duplicate after worker failure | Medium | Idempotent stages, renewable leases, immutable attempts, conditional transitions |
| Chromium/FFmpeg output varies across hosts | Medium | Pinned image/fonts/runtime, deterministic locale, fixed render settings |
| Screenshot review consumes excessive cost | Medium | Representative timestamps, contact sheets, image caps, attempt/token budgets |
| Four-file backend and three-file frontend conventions diverge | Medium | Compatibility envelope in V1, explicit normalization and contract tests |

## Production review gates

Production rollout must not begin until the user approves:

- this plan and the feature specification;
- the `styles.css` compatibility decision;
- initial storage and hosted container providers;
- initial evaluation rubric and budget limits.
