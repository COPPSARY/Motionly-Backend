# Cloud AI Generation: Backend Specification

Status: Implemented V1 scaffold; production validation and quality ratification remain  
Scope: Motionly Backend only; frontend implementation is deferred  
Companion documents: `tasks/plan.md`, `tasks/todo.md`, `docs/frontend-ai-generation-integration.md`, and `docs/cloud-ai-generation-performance.md`

## Implementation snapshot (2026-09-02)

The repository now contains the provider-neutral contracts/state machine and OpenAPI description, generation and artifact schema/migrations, authenticated generation/assets/artifacts APIs, replayable SSE with backpressure and terminal-page handling, PostgreSQL lease queue, Gemini adapter with bounded transient retry, versioned Motionly skills plus reviewed GSAP helpers, constrained source tools/policy, metadata-only tool-call auditing, trusted coordinator with bounded conversation/tool/time budgets, Docker sandbox contract, Vite/Chromium/FFmpeg renderer, mandatory pre-publication export, revision-safe publication, streamed and independently content-validated assets, local private object storage, retention cleanup, dependency-aware readiness, mutation rate limiting, automated tests, and a deterministic structural/adversarial evaluation runner. Renderer reports record the actual Node, Chromium, FFmpeg, and FFprobe versions used for an exported artifact.

Local verification on 2026-09-02: TypeScript check and production build passed; 112 automated tests passed and three environment-dependent tests were skipped; all eight deterministic structural/adversarial evaluation cases passed; the production dependency audit reported zero vulnerabilities; and the pinned six-file Motionly frontend baseline matched commit `d4deb89164310de20edf796d702cb841692d93b6`. The skipped gates require Docker/FFmpeg or configured external services and are listed below.

This is not yet a production release. The following gates still require an environment or human decision outside this checkout:

- apply migrations and exercise lease/publication races against a clean PostgreSQL database;
- build and adversarially test `Dockerfile.renderer` on a Docker host (Docker is unavailable on the current workstation);
- run an opt-in Gemini tool/image smoke test with a server-only key;
- run the full credentialed create/edit evaluation and ratify its blind visual-quality baseline;
- choose and implement the production object-storage adapter, dashboards/tracing, and hosted container runtime;
- implement OpenAI, Anthropic, or OpenAI-compatible adapters if selected (the provider-neutral interface and configuration slots already exist).

## 1. Objective

Build a cloud generation service that turns a prompt and optional assets into a new, immutable Motionly project revision. It must also edit an existing project without losing prior versions. Generated work must preserve Motionly's code-first architecture and remain selectable, editable, previewable, and exportable in the existing editor.

The authored composition remains:

```text
composition.html + timeline.js -> thin index.ts -> CompositionRuntime -> preview/export
```

The backend must never introduce a JSON animation document, generated-DOM representation, conversion layer, or separate renderer.

## 2. Scope

### Included in this backend feature

- Authenticated create and edit generation requests.
- Immutable prompt, job, attempt, event, artifact, and output records.
- A durable PostgreSQL queue for generation and render work.
- A provider-neutral model interface with Gemini implemented first.
- Versioned Motionly skill bundles and deterministic skill routing.
- Isolated workspaces for source editing, validation, browser capture, and export.
- Automated build, structural validation, representative-frame capture, visual review, and bounded repair attempts.
- Conditional publication of successful output as a new project version.
- Progress streaming, polling, cancellation, retry, and stable errors.
- An evaluation harness and quality gate based on the current Motionly preset.
- Object-storage interfaces for assets, screenshots, logs, thumbnails, and videos.

### Explicitly deferred

- Replacing the placeholder frontend AI panel.
- Frontend auth/project synchronization work.
- A user-facing provider/model picker.
- Billing, credits, subscriptions, and organization-level quotas beyond safety limits.
- Collaborative merge UI for edits made while a generation is running.
- Training or fine-tuning a model.

## 3. Assumptions and decisions

1. Node.js 22.12+, TypeScript, Express 5, Drizzle, PostgreSQL, Supabase Auth, Zod, and Vitest remain the backend stack. This floor matches the pinned Chromium client rather than relying on an unsupported Node 20 installation.
2. PostgreSQL is the first queue provider. The queue is hidden behind an interface so a managed queue can replace it later. In V1, a generation queue task synchronously invokes a fresh isolated renderer container; the `RENDER` task type is reserved for independently queued exports and is not yet consumed by the generation worker.
3. Gemini is the first active model provider, configured by server environment variables. OpenAI, Anthropic/Claude, and an administrator-configured OpenAI-compatible endpoint use the same internal contract later.
4. Model names are configuration, not hard-coded application behavior. Preview or retired model IDs can therefore be changed without an API migration.
5. API keys are server-only secrets and never enter a project container, database row, log, artifact, or frontend response.
6. A generation is pinned to `baseVersionId` and `baseRevision`. It may only become current if that project revision is still current when publication occurs.
7. The current backend transports four source entries, including `styles.css`, while the live Motionly preset authors scoped CSS inside `composition.html`. V1 keeps the four-file HTTP/storage envelope for compatibility. `styles.css` may be empty, and the architectural quality checks focus on `composition.html`, `timeline.js`, and the thin `index.ts` adapter.
8. The current frontend repository at `../Motionly` is a design-time source for the initial skill snapshot, composition contract, preset helpers, fixtures, and evaluation baseline. Production workers never read a sibling frontend checkout.
9. A trusted coordinator calls the model API. Untrusted project code runs in a separate sandbox with no provider credentials and no general network access.

## 4. System architecture

```text
Motionly editor (later)
        |
        | HTTPS + cookie auth + CSRF
        v
API process ------------------------------------------------------+
  projects, generations, status, SSE, cancellation                |
        |                                                         |
        +--> PostgreSQL                                           |
        |    versions, jobs, events, attempts, messages            |
        |                                                         |
        +--> private object storage                               |
        |    uploaded assets, screenshots, previews, videos        |
        |                                                         |
        +--> durable PostgreSQL queue                              |
                    |                                             |
                    v                                             |
          Generation coordinator (trusted)                        |
          - routes versioned skills                               |
          - calls Gemini/provider adapter                          |
          - executes typed source tools                            |
          - controls repair budget                                 |
                    |                                             |
                    v                                             |
          Isolated generation/render sandbox                      |
          - project snapshot + allowed assets                      |
          - Node, pinned Motionly runtime, GSAP                     |
          - Chromium, fonts, FFmpeg                                |
          - no secrets, no network, strict limits                  |
                    |                                             |
                    +--> build/validate/capture/export ------------+
```

The generation coordinator and render worker may initially be deployed from one worker image, but they remain separate modules and queue task types. This preserves a clean path to separate scaling and stricter render isolation.

## 5. Generation lifecycle

### 5.1 Create flow

1. The API validates membership, write access, prompt length, asset ownership, requested format, and idempotency.
2. The API creates a project from a server-owned starter preset, creates generation records pinned to version 1, and enqueues the job in one transaction.
3. The worker snapshots the pinned source and approved assets into a new isolated workspace.
4. The skill router selects a small, versioned instruction bundle based on the prompt and requested operation.
5. The provider receives the prompt, project source, asset manifest, selected skills, runtime contract, helper catalogue, and typed editing/validation tools.
6. The provider requests source edits through typed tools. The coordinator validates paths and payloads before applying them.
7. The sandbox builds and runs structural/runtime checks.
8. Chromium captures deterministic PNG frames at stratified scene boundaries/focal moments and always includes the final frame; long scene lists are sampled across the full timeline rather than truncated at the beginning.
9. The provider reviews diagnostics and images. If necessary, it performs a bounded repair loop.
10. On success, the backend stores artifacts and atomically advances the project to a new immutable version if `baseRevision` still matches.
11. The job emits `COMPLETED`, including the new version and project revision.

### 5.2 Edit flow

The edit flow is the same, except it starts from an existing `baseVersionId`, includes the user request and a bounded prior conversation window, and must preserve unrelated source and assets. The window is anchored to the job's own immutable prompt, so prompts submitted later on the same thread cannot leak into an earlier queued job.

### 5.3 Concurrent edit behavior

- If the project revision is unchanged, successful output is published automatically.
- If a user or another generation changed the project, the candidate output is preserved but not made current. The generation finishes as `AWAITING_APPLY` with error code `REVISION_CONFLICT` and the current revision.
- A later apply endpoint may publish the candidate after the client reloads or explicitly retries from the latest version. V1 does not attempt an automatic three-way source merge.

## 6. State model

### Generation status

```text
QUEUED -> PREPARING -> GENERATING -> VALIDATING -> RENDERING
       -> REVIEWING -> REPAIRING (bounded loop)
       -> PUBLISHING -> COMPLETED

Any active state -> CANCELLING -> CANCELLED
Any active state -> FAILED
PUBLISHING -> AWAITING_APPLY when the project revision changed
```

Terminal states are `COMPLETED`, `AWAITING_APPLY`, `CANCELLED`, and `FAILED`.

### Progress contract

Progress is stage-based and monotonic; it is not a promise of wall-clock completion. Every event has a sequence number so SSE clients can reconnect using `Last-Event-ID` and polling clients can reconcile missed events.

Suggested stage ranges:

| Stage | Percent |
|---|---:|
| Queued/preparing | 0-10 |
| Generating/editing | 10-40 |
| Build/validation | 40-55 |
| Chromium capture | 55-70 |
| Visual review/repair | 70-90 |
| Publishing/artifacts | 90-100 |

## 7. Data model additions

The exact Drizzle names may be adjusted during migration review, but the relationships are contractual.

### `generation_threads`

- `id`, `project_id`, `created_by`, `created_at`, `updated_at`
- One project may have multiple threads; a generation belongs to one thread.

### `generation_messages`

- `id`, `thread_id`, `generation_id`, `role`, `content`, `asset_refs`, `created_at`
- Stores user-visible conversation content only. Never persist hidden model reasoning.

### `generation_jobs`

- `id`, `workspace_id`, `project_id`, `thread_id`, `created_by`
- `intent`: `CREATE` or `EDIT`
- `status`, `stage`, `progress`, `attempt_count`, `max_attempts`
- `base_version_id`, `base_revision`, `output_version_id`
- `provider`, `model`, `skill_bundle_version`, `runtime_version`
- `idempotency_key`, `cancel_requested_at`, `started_at`, `finished_at`
- `error_code`, `error_message`, `error_details`
- timestamps and indexes for project history, queue claims, and cleanup.

### `generation_attempts`

- One record per model/build/visual-repair cycle.
- Stores attempt number, normalized token/usage metadata, timing, finish reason, validation summary, and artifact references.
- Provider-specific response state is encrypted or ephemeral and never returned through the public API.

### `generation_tool_calls`

- One metadata-only audit row per model tool execution, linked to its generation and attempt.
- Stores the attempt-local sequence, tool name, outcome, duration, bounded input/output summaries, and stable error code.
- Never stores replacement source, patch search/replacement text, prompt content, provider payloads, or secrets; edit summaries contain paths, byte counts, and edit counts only.

### `generation_events`

- `generation_id`, monotonic `sequence`, `type`, `stage`, `progress`, public-safe payload, `created_at`.
- Unique `(generation_id, sequence)` supports replayable SSE.

### `generation_outputs`

- Holds the successful candidate source bundle, source hash, parent/base version, validation report, and publication state.
- This preserves work when publication loses a revision race.

### `assets`, `project_assets`, and `artifacts`

- Object metadata belongs in PostgreSQL; binaries belong in private object storage. V1 uses a local adapter; multi-host deployment requires a shared S3-compatible adapter.
- Store content type, byte size, checksum, object key, creator, state, and retention policy.
- Generation artifacts include screenshots, build logs, validation reports, thumbnails, and optional rendered video.

### Queue tables

- Durable task row with task type, payload reference, priority, availability time, lease owner/expiry, attempt count, and dead-letter state.
- Workers claim with an atomic PostgreSQL lease (`FOR UPDATE SKIP LOCKED` or equivalent repository behavior), renew leases, and recover expired work.

## 8. Public API contract

All endpoints are under `/v1`, require the existing opaque session cookie, and require `X-CSRF-Token` on mutations. Generation create/edit/cancel/retry/apply mutations accept `Idempotency-Key`; asset byte transfer uses its upload-session ID as the replay boundary. Errors retain the existing stable envelope.

### Submit a new-project generation

```text
POST /v1/workspaces/:workspaceId/generations
```

```json
{
  "prompt": "Create a 20 second product launch film for Acme",
  "project": {
    "name": "Acme launch",
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "duration": 20
  },
  "presetId": "motionly-product-promo",
  "assetIds": []
}
```

Returns `202 Accepted` with a `Generation` resource and the newly created project ID.

### Submit an edit generation

```text
POST /v1/projects/:projectId/generations
```

```json
{
  "prompt": "Make the CTA transition more cinematic and hold it for one second longer",
  "baseVersionId": "uuid",
  "baseRevision": 4,
  "threadId": "uuid-or-omitted",
  "assetIds": []
}
```

### Read and control jobs

```text
GET  /v1/projects/:projectId/generations?page=1&pageSize=20
GET  /v1/generations/:generationId
GET  /v1/generations/:generationId/events
POST /v1/generations/:generationId/cancel
POST /v1/generations/:generationId/retry
POST /v1/generations/:generationId/apply
GET  /v1/generations/:generationId/artifacts
```

`GET .../events` uses `text/event-stream`, sends heartbeat comments, and replays events after `Last-Event-ID`. Polling `GET /v1/generations/:id` remains the compatibility fallback.

### Stable response shape

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "threadId": "uuid",
  "intent": "EDIT",
  "status": "RENDERING",
  "stage": "CAPTURING_FRAMES",
  "progress": 63,
  "baseVersionId": "uuid",
  "baseRevision": 4,
  "outputVersionId": null,
  "attempt": 1,
  "maxAttempts": 3,
  "createdAt": "2026-09-01T00:00:00.000Z",
  "startedAt": "2026-09-01T00:00:01.000Z",
  "finishedAt": null,
  "error": null
}
```

### Error codes

- `GENERATION_NOT_FOUND`
- `GENERATION_ALREADY_TERMINAL`
- `GENERATION_CANCELLED`
- `GENERATION_TIMEOUT`
- `GENERATION_LIMIT_EXCEEDED`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_OUTPUT_INVALID`
- `SANDBOX_FAILED`
- `SOURCE_VALIDATION_FAILED`
- `BUILD_FAILED`
- `CAPTURE_FAILED`
- `EXPORT_FAILED`
- `RUNTIME_FAILED`
- `RUNTIME_VERSION_UNAVAILABLE`
- `RUNTIME_VERSION_MISMATCH`
- `SKILL_BUNDLE_UNAVAILABLE`
- `VISUAL_REVIEW_FAILED`
- `ASSET_NOT_FOUND`
- `ASSET_NOT_READY`
- `ASSET_BUDGET_EXCEEDED`
- `REVISION_CONFLICT`

Provider response bodies and internal stack traces are never placed in public errors.

## 9. Provider-neutral AI interface

The model integration must normalize provider differences before the generation service sees them.

```ts
interface GenerationModelProvider {
  readonly name: 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';
  runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent>;
}

interface ModelTurnInput {
  model: string;
  systemInstructions: string;
  messages: ModelMessage[];
  tools: ModelToolDefinition[];
  images: ModelImageInput[];
  limits: { maxOutputTokens: number; timeoutMs: number };
}
```

Normalized events cover text, tool calls, usage, completion, retryable provider errors, and fatal provider errors. Provider-specific IDs/signatures remain inside the adapter and are round-tripped as required, but are not exposed as Motionly API contracts.

### Provider rollout

1. **Gemini:** first implementation using the official Google Gen AI SDK, custom function calling for Motionly tools, and image inputs for screenshot review.
2. **OpenAI:** later adapter based on the Responses API and function tools.
3. **Anthropic/Claude:** later adapter based on the Messages API and client tool-use blocks.
4. **OpenAI-compatible:** later administrator-only base URL and headers. The base URL is never supplied per user request; validate HTTPS and enforce an outbound allowlist to prevent SSRF.

Official documentation confirms the core portable pattern: the provider returns a structured tool request, the application executes it, and the result is returned to the model. Google also distinguishes function calling for actions from structured output for final response formatting. See:

- Google Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Google Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Google Gemini Files API: https://ai.google.dev/api/files
- OpenAI Responses quickstart and tools: https://platform.openai.com/docs/quickstart/make-your-first-api-request
- Anthropic tool-use overview: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview

## 10. Model tool boundary

The model never receives a raw shell tool. It receives a narrow, audited set of operations:

- `list_project_files`
- `read_project_file`
- `replace_project_file`
- `apply_project_patch`
- `list_assets`
- `inspect_asset`
- `run_source_checks`
- `build_preview`
- `capture_frames`
- `read_public_diagnostics`
- `submit_candidate`

Rules:

- Source paths are enum-validated against the canonical source bundle.
- Asset paths are generated by the server and cannot contain traversal segments.
- File sizes and patch sizes have hard limits.
- Build and capture operations map to fixed internal commands; the model cannot provide a command string.
- Tool results are bounded and redact absolute host paths, secrets, environment variables, and internal infrastructure details.
- Every tool execution writes a metadata-only audit row before its result is returned to the model; failure to persist mandatory audit metadata fails the attempt.
- A candidate cannot publish unless all mandatory validators pass.

## 11. Motionly skill system

### Storage and versioning

- Store skill content in `packages/motionly-skills/catalog/<bundle-version>/`.
- Begin with a reviewed snapshot of `../Motionly/.agents/skills/write-motionly/` plus the Motionly runtime rules and helper catalogue.
- Include a manifest containing semantic version, content hash, compatible runtime range, tags, entry file, references, and change notes.
- Record the exact skill-bundle version and hash on every generation job.
- Never read skills from the frontend checkout at runtime.

### Routing

Use deterministic classification before model generation. Route from prompt terms, affected files, selected layer/scene metadata, asset types, and intent. Suggested tags include:

- `core` (always included)
- `code-authoring`
- `timeline`
- `typography`
- `transitions`
- `camera`
- `svg`
- `assets`
- `rendering`
- `scenes`
- `composition`

The router returns a token-budgeted bundle and logs selected skill IDs, versions, and reasons. It does not send every skill on every request.

### Improvement process

Do not edit the baseline skill in place. Add a new bundle version, run it against the fixed evaluation set, compare it with the prior version, and promote only if it improves or preserves structural, visual, latency, and cost gates.

## 12. Sandbox and worker requirements

Each attempt receives a newly created workspace from the pinned project version.

Required controls:

- Non-root container user and read-only root filesystem.
- Writable workspace limited to a dedicated temporary mount.
- No Docker socket, host home directory, cloud credentials, provider keys, or database URL.
- Network disabled by default. Assets are staged by the trusted worker before launch.
- CPU, memory, PID, file-size, storage, and wall-clock limits.
- Seccomp/AppArmor or equivalent hardened runtime profile in hosted deployment.
- Explicit environment allowlist and deterministic locale/timezone/font set.
- Pinned Node, Chromium, GSAP, Motionly runtime, font, and FFmpeg versions.
- Unique workspace and object prefixes per job; cleanup on success, failure, timeout, and worker recovery.
- Kill the entire process tree on cancellation or timeout.

The trusted worker owns container creation. A sandbox never creates another container.

## 13. Validation and visual repair

### Mandatory source checks

- Only allowed source paths changed.
- `composition.html` contains semantic HTML/SVG and scoped styles.
- `timeline.js` writes to the caller-owned GSAP timeline.
- `index.ts` stays a thin metadata/mounting adapter.
- No `.motion`, JSON animation DSL, dynamic remote script, alternate renderer, or generated DOM representation.
- No unapproved remote URLs, imports, filesystem access, child processes, or runtime network calls.
- Scene metadata, duration, fps, and track spans are valid.
- Important layers have stable IDs, exist in the mounted DOM, and are registered. The browser gate proves a one-to-one match between unique authored `data-edit` IDs and registered editor layers; duplicates or unregistered authored layers block publication.
- Every referenced asset resolves to an approved staged asset.

### Runtime checks

- Typecheck and bundle succeed.
- Composition mounts without console errors or unhandled rejections.
- Deterministic seek works at frame boundaries.
- A real registered visual target changes across playback.
- No blank representative frame and no stale layer covering the final frame.
- Preview PNG capture and export-source PNG capture match within the defined pixel tolerance before video encoding.
- Export completes with expected width, height, fps, duration, and codec metadata.

### Visual review loop

Capture at least:

- first non-empty frame;
- each scene arrival, focal/hold moment, and resolve;
- transition midpoints;
- final frame;
- timestamps implicated by runtime failures.

When the candidate has more scenes than the capture budget, select scene midpoints evenly from the full duration and preserve the final frame. Visual-provider input is independently capped at eight evenly distributed frames so late scenes cannot be omitted merely because they occur after the first eight captures.

During full preview export, each quantized PNG frame is hashed and streamed directly into FFmpeg with backpressure. The renderer does not accumulate a full temporary PNG sequence in the bind-mounted project workspace, which keeps temporary storage bounded while preserving exact pre-encoding frame hashes for parity checks.

V1 additionally caps selected assets at 500 MB per generation, total work at four billion pixel-frames, output video at 2 GB, and export length at 18,000 frames. These are hard safety ceilings rather than product recommendations and can only be changed with matching API, renderer, capacity, and evaluation updates.

Provide the provider a contact sheet plus per-frame images, timestamps, scene metadata, and concise diagnostics. Repair attempts are bounded by both count and total job budget (initially three attempts). Every attempt starts from the last validated candidate, records its changes, and reruns all mandatory gates. If the budget is exhausted, return a clear failure and preserve diagnostics.

## 14. Reliability, cancellation, and retries

- Submission is idempotent per authenticated user and idempotency key; clients should generate a fresh UUID for each intended mutation.
- Generation mutations are user-scoped to 60 requests per minute in each API process by default, in addition to the durable active-job concurrency limit. Multi-instance production should replace the in-memory rate-limit store with a shared store at the edge or API tier.
- Job claims use renewable leases; expired leases return to the queue until `maxAttempts`.
- Retry provider rate limits and transient infrastructure failures with jittered backoff.
- Do not automatically retry deterministic source-policy failures without a repair turn.
- Cancellation is cooperative first and forceful after a short grace period.
- A retry creates a new job linked to the original, pins an explicit base version, and never mutates historical attempts.
- Job event writes and state transitions are transactional and validated against an allowed transition map.
- All successful source publication is atomic with project revision advancement.

## 15. Observability and retention

- Structured logs include request ID, generation ID, project ID, attempt, stage, duration, and stable error code.
- Metrics include queue depth/age, stage latency, provider latency/errors, tokens, cost estimate, sandbox failures, repair count, success rate, cancellation latency, and publication conflicts.
- Traces connect API submission, queue claim, provider turns, tool calls, sandbox actions, object storage, and publication.
- Prompts and source are sensitive customer content. Access is workspace-authorized; administrative content-access auditing is required before production support tooling is enabled.
- Public logs contain no prompt/source by default. Debug payload capture is opt-in, encrypted, access-controlled, and time limited.
- Define separate retention for temporary screenshots/build logs, final artifacts, and immutable project versions.

## 16. Evaluation and quality gate

Create a versioned evaluation set with:

- new video prompts across product launch, explainer, logo/SVG, UI demo, typography, and camera-heavy work;
- edits that change timing, copy, color, layout, transition, asset, and one isolated scene;
- adversarial prompts for path traversal, secret access, network access, alternate formats, and destructive changes;
- the current `motionly-product-promo` preset as the reference-quality composition.

Measure four layers:

1. **Structural:** allowed files, thin adapter, registered elements, truthful scenes/tracks, no forbidden architecture.
2. **Executable:** build/mount/seek/export success, no console/runtime errors.
3. **Visual:** no blank/clipped/stale frames, readable copy, clear hierarchy, continuous transitions, representative-frame review.
4. **Product:** prompt adherence, edit locality, layer editability, preview/export parity, and preservation of prior revisions.

Proposed V1 release gates (ratify after the baseline run):

- 100% preservation of all prior project versions.
- 100% rejection of security/policy evaluation prompts.
- At least 90% of standard prompts publish a valid result within three attempts.
- 100% of published results pass required structural and runtime checks.
- Identical pre-encoding preview/export frames meet the agreed pixel-difference threshold.
- Blind human review is no worse than 0.5 points below the current preset on a five-point rubric, with no category median below 3.5.

## 17. Commands and project structure

Current verification commands:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run eval:cloud-generation
npm.cmd audit --omit=dev
```

Implemented layout:

```text
apps/api/src/{controllers,routes,services,repositories}/ generation, asset, and artifact HTTP modules
apps/generation-worker/src/        generation coordinator and job consumer
apps/renderer/src/                 sandbox render/capture/export tasks
packages/ai-providers/             normalized provider contract and adapters
packages/contracts/                Zod schemas and public API types
packages/generation-tools/         typed source/build/capture tools
packages/job-queue/                durable queue interface and PostgreSQL adapter
packages/motionly-skills/          versioned skill bundles and router
packages/object-storage/           private object storage interface
packages/sandbox/                  runner contract and Docker implementation
packages/database/src/             Drizzle schema/client
drizzle/migrations/                committed migrations
tests/unit/                         pure service/router/provider/tool tests
tests/integration/                  DB/API/queue/storage contract tests
tests/e2e/                          containerized generation and render flows
evals/cloud-generation/            prompts, fixtures, rubrics, reports
```

## 18. Engineering boundaries

### Always

- Validate all API, provider, tool, object-storage, and sandbox boundaries.
- Pin base versions, provider/model configuration, skills, runtime, and images per job.
- Create immutable versions and keep retry/cancellation auditable.
- Run focused tests plus typecheck and build at every checkpoint.

### Review before changing

- Public API fields or error semantics.
- Database migrations after they have reached a shared environment.
- Sandbox network policy, host mounts, or allowed build commands.
- Quality thresholds, repair budget, retention, and provider/model defaults.
- The compatibility decision around `styles.css`.

### Never

- Commit or log model, storage, database, or auth secrets.
- Give untrusted source a Docker socket or provider credentials.
- Accept arbitrary shell commands or arbitrary output paths from a model.
- Make a generated candidate current after a revision conflict.
- Replace Motionly's HTML/CSS/GSAP architecture with a JSON format or parallel runtime.

## 19. Definition of done

- New and edit generations complete through the backend API.
- Gemini is functional behind the provider interface; adding another provider does not alter generation service logic or public endpoints.
- Every attempt runs in a fresh restricted workspace and leaves no credentials behind.
- Successful output passes source, build, runtime, visual, selection, and parity checks.
- Successful output becomes a new immutable project version, or is preserved as `AWAITING_APPLY` when concurrency prevents publication.
- Polling and replayable SSE report stable progress; cancellation and retry work from every applicable state.
- Prior source versions remain restorable.
- The evaluation set and quality report demonstrate the agreed V1 gates.
- The frontend handoff document matches the implemented OpenAPI contract.

## 20. Decisions and remaining human review

1. **Selected for V1:** keep `styles.css` as the fourth compatible transport file; it may be empty when CSS is scoped inside `composition.html`.
2. **Selected for V1:** use a small backend-owned editable starter; keep the current frontend preset pinned by commit/hash as the quality reference.
3. **Local implementation:** private filesystem object storage. Choose Supabase Storage or another S3-compatible adapter before multi-host production deployment.
4. Confirm the hosted container runtime (single Docker host, managed container jobs, or Kubernetes).
5. Ratify evaluation prompts and quality thresholds after the credentialed baseline run and blind review.
