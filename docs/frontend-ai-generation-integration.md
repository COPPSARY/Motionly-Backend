# Frontend Handoff: Cloud AI Generation

Status: Backend V1 contract implemented and locally verified; initial landing/editor integration implemented locally  
Frontend references: `C:\Users\proms\OneDrive\Desktop\Motionly` and `C:\Users\proms\OneDrive\Desktop\MotionlySite`

Backend verification reference (2026-09-02): typecheck and production build pass, 121 tests pass with three environment-dependent skips, all 8 deterministic structural/adversarial evaluation cases pass, and the six pinned frontend baseline files match commit `d4deb89164310de20edf796d702cb841692d93b6`. Docker/FFmpeg, clean-PostgreSQL concurrency, credentialed Gemini, and blind visual-quality gates still require their target environments before production release.

## Implemented frontend slice (2026-09-02)

- `MotionlySite` carries a non-empty landing prompt to the editor with `URLSearchParams`; it does not call a model or generation API from the landing page.
- Login return handling preserves the prompt and uses the configured editor origin.
- `MotionlySite/.env` supports `MOTIONLY_API_URL` and `MOTIONLY_EDITOR_URL`; `npm start` and `npm run build` generate the browser runtime config before Angular starts.
- `Motionly` uses `VITE_MOTIONLY_API_URL`, authenticated cookies, the session CSRF token, the real `/v1` asset routes, and unwrapped API envelopes.
- The editor preserves a landing prompt across its own login redirect, waits for the cloud workspace, starts one new-project generation, streams progress, and opens the generated project when the terminal completion event arrives.
- Manual editor prompts use the selected project's real `currentVersionId` and `revision`; when no project is selected they create a new generated project.
- The local `feat/project-crud` branch was fast-forwarded into the Motionly working branch and its response types were aligned with the current backend `{ project, version }` contract.

Verified locally: Motionly typecheck, 20/20 tests, and production build pass; MotionlySite production build passes; the new runtime-config tests pass 3/3. A headless-Chrome flow confirmed that the exact Unicode prompt `Create a crisp launch — សួស្តី & kinetic type` travels from the landing textarea into the editor's generation POST body. The wider MotionlySite suite currently has unrelated pre-existing failures (25 pass, 13 fail) in older navigation/content assertions and component tests missing `HttpClient` providers.

## Purpose

Replace the placeholder `submitAssistant` behavior in `src/ui/App.svelte` with an authenticated client for backend generation jobs. The frontend sends prompts/assets and renders progress; the backend owns model selection, skills, source editing, validation, repair, storage, and revision publication.

The frontend must not call Gemini, OpenAI, Anthropic, or a custom model endpoint directly and must never contain provider API keys.

## Required frontend capabilities

1. Load the authenticated user, project metadata, current source version, and project revision.
2. Submit a new-project or existing-project generation with an idempotency key.
3. Add the user's prompt to the assistant transcript immediately.
4. Show stage-based progress from SSE, with polling fallback.
5. Disable duplicate submission while the same idempotency key is pending.
6. Allow cancellation while the job is active.
7. On `COMPLETED`, fetch the returned current source/version and remount `CompositionRuntime`.
8. Rebuild storyboard/timeline data from returned `CompositionDefinition.scenes` and registered layers; do not translate the source into JSON.
9. On `AWAITING_APPLY`, explain that the project changed, reload current revision, and offer an explicit retry/apply decision.
10. On `FAILED`, show the public error and a retry action without exposing internal provider/container details.

## Backend configuration

The frontend needs only:

```text
VITE_MOTIONLY_API_URL=https://api.example.com
```

Requests use the existing opaque `motionly_session` cookie with `credentials: "include"`. Mutations send the session-bound `X-CSRF-Token`. The provider and model are intentionally absent from frontend configuration in V1.

The backend must allow both browser origins because the landing site checks the session before handing off to the editor. For local development:

```text
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:4200
```

Production should use the corresponding `https://app.motionly.site` and landing-site origins.

## API flow for editing an open project

### 1. Submit

```http
POST /v1/projects/{projectId}/generations
Content-Type: application/json
X-CSRF-Token: {csrfToken}
Idempotency-Key: {uuid}
```

```json
{
  "prompt": "Make the CTA transition more cinematic and hold it longer",
  "baseVersionId": "current-version-uuid",
  "baseRevision": 4,
  "threadId": "existing-thread-uuid-or-omit",
  "assetIds": []
}
```

Expected response: `202 Accepted` with the stable `Generation` resource described in `docs/cloud-ai-generation.md`.

### 2. Stream progress

```http
GET /v1/generations/{generationId}/events
Accept: text/event-stream
```

Because native `EventSource` cannot set arbitrary headers, the GET endpoint relies on the HTTP-only session cookie and does not require CSRF. If the deployment needs a non-cookie auth scheme later, use a fetch-based SSE client rather than placing tokens in the URL.

Example events:

```text
id: 12
event: progress
data: {"generationId":"...","status":"VALIDATING","stage":"SOURCE_CHECKS","progress":48,"message":"Checking Motionly source"}

id: 13
event: progress
data: {"generationId":"...","status":"RENDERING","stage":"CAPTURING_FRAMES","progress":63,"message":"Reviewing key frames"}

id: 18
event: completed
data: {"generationId":"...","sequence":18,"type":"COMPLETED","status":"COMPLETED","stage":"COMPLETED","progress":100,"data":{"outputVersionId":"...","projectRevision":5}}
```

Treat SSE delivery as at least once. Keep the highest sequence ID and ignore older duplicates. On disconnect, reconnect with `Last-Event-ID` when the client permits it, or poll:

```http
GET /v1/generations/{generationId}
```

Use a modest polling fallback such as two seconds while active and stop on a terminal state.

### 3. Reload the generated revision

After `COMPLETED`:

```http
GET /v1/projects/{projectId}
GET /v1/projects/{projectId}/source
```

Verify the returned revision and version match the completion event. Compile/load the authored files through the same Motionly mounting boundary:

```text
composition.html + timeline.js -> thin index.ts -> CompositionRuntime
```

The backend transport may also contain `styles.css`; it can be empty. Do not create a JSON animation representation or a second preview runtime.

## New-project generation

```http
POST /v1/workspaces/{workspaceId}/generations
Content-Type: application/json
X-CSRF-Token: {csrfToken}
Idempotency-Key: {uuid}
```

```json
{
  "prompt": "Create a 20 second launch video for Acme",
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

The `202` response includes the new `projectId`, allowing the editor to navigate to an initializing project immediately and continue streaming its generation.

## Upload assets before generation

Use the backend asset lifecycle, not provider upload APIs from the browser:

```text
POST /v1/workspaces/:workspaceId/assets/uploads
PUT  /v1/assets/uploads/:uploadId/content
POST /v1/workspaces/:workspaceId/assets/uploads/:uploadId/complete
POST /v1/projects/:projectId/assets
```

The create call returns `uploadId`, `assetId`, `uploadUrl`, and `expiresAt`. For the V1 local-storage adapter, `uploadUrl` is the authenticated API `PUT` route above; send the declared content type, exact byte count, `credentials: "include"`, and CSRF header. A future remote-storage adapter may return an absolute signed URL, so clients should use the returned URL rather than constructing it. Complete the upload only after the `PUT` resolves; completion independently rechecks stored size, SHA-256, MIME signature, and safe SVG content before returning `READY`. If it returns `ASSET_UPLOAD_INCOMPLETE`, wait for the upload request to finish and retry completion. Display upload progress separately from generation progress.

Create the upload with the original filename, MIME type, exact byte count, and lowercase SHA-256 digest:

```json
{
  "fileName": "dashboard.png",
  "contentType": "image/png",
  "byteSize": 245801,
  "checksum": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Attach the completed asset to an existing project with `POST /v1/projects/{projectId}/assets` and `{ "assetId": "..." }`. A new-project generation attaches its submitted assets as part of the generation transaction.

Generated `index.ts` references approved assets through virtual paths such as `./assets/{assetId}.png?url` and substitutes those URLs into placeholders in `composition.html`. Before compiling a returned revision, the frontend source loader must download the attached assets and expose each byte stream at the exact virtual path. Do not rewrite the authored HTML or create a separate asset/render representation.

`GET /v1/projects/{projectId}/source` returns `{ data: { id, projectId, versionNumber, sourceHash, message, createdBy, createdAt, revision, files } }`. Treat `data.id` as the source version ID and verify it equals both the project's `currentVersionId` and the generation's `outputVersionId` before remounting.

## Cancellation, retry, and conflict handling

```text
POST /v1/generations/:generationId/cancel
POST /v1/generations/:generationId/retry
POST /v1/generations/:generationId/apply
```

- **Cancel:** keep displaying progress until the backend reaches `CANCELLED`; cancellation is not instantaneous.
- **Retry:** use a new idempotency key. The server returns a new generation ID linked to the original.
- **Rate limit:** on `429 RATE_LIMITED`, honor `Retry-After`/rate-limit headers, keep the current local prompt, and retry only after user intent or the indicated delay.
- **Asset budget:** reject or let the user deselect files when the backend returns `422 ASSET_BUDGET_EXCEEDED`; V1 permits at most 500 MB of selected ready assets per generation even though an individual workspace may store more.
- **Retry base:** send `{}` to pin the latest source automatically, or send both `baseVersionId` and `baseRevision` from the freshly loaded project. The backend rejects a partial or stale pair.
- **Revision conflict:** do not silently apply output. Reload the current project and offer to retry the prompt from the latest revision. An explicit apply may be offered only when the backend says it is safe.

## Suggested client types

These should ultimately be generated or imported from the backend OpenAPI schema rather than maintained by hand.

```ts
type GenerationStatus =
  | "QUEUED"
  | "PREPARING"
  | "GENERATING"
  | "VALIDATING"
  | "RENDERING"
  | "REVIEWING"
  | "REPAIRING"
  | "PUBLISHING"
  | "CANCELLING"
  | "COMPLETED"
  | "AWAITING_APPLY"
  | "CANCELLED"
  | "FAILED";

interface Generation {
  id: string;
  workspaceId: string;
  projectId: string;
  threadId: string;
  intent: "CREATE" | "EDIT";
  status: GenerationStatus;
  stage: string;
  progress: number;
  baseVersionId: string;
  baseRevision: number;
  outputVersionId: string | null;
  provider: "gemini" | "openai" | "anthropic" | "openai-compatible";
  model: string;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: null | {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

## Suggested editor state machine

```text
idle
  -> submitting
  -> active (SSE + polling recovery)
     -> cancelling
     -> completed -> reloading-source -> idle
     -> awaiting-apply -> conflict UI
     -> failed -> retry UI
     -> cancelled -> idle
```

Persist the active generation ID per project so a browser refresh can reconnect. The backend is the source of truth for status.

## UI mapping

| Backend state/stage | Suggested assistant message |
|---|---|
| `QUEUED` | Waiting for a generation worker… |
| `PREPARING` | Preparing your project and assets… |
| `GENERATING` | Editing the Motionly source… |
| `VALIDATING` | Building and checking the composition… |
| `RENDERING` | Rendering important frames… |
| `REVIEWING` | Reviewing visual quality… |
| `REPAIRING` | Fixing an issue (attempt N of M)… |
| `PUBLISHING` | Saving a new project revision… |
| `COMPLETED` | Done — loading the new revision. |
| `AWAITING_APPLY` | The project changed while generation ran. Reload before applying. |
| `FAILED` | Use the backend's public-safe message and offer retry. |

Do not display raw provider thinking, container logs, stack traces, or provider response payloads.

## Frontend implementation targets

Likely additions in the current repository:

```text
src/api/client.ts                  cookie/CSRF/error handling
src/api/generations.ts             typed generation methods
src/stores/generation.ts           per-project active job state
src/ui/App.svelte                  replace placeholder submitAssistant
src/ui/components/Assistant*.svelte optional extraction of chat/progress UI
tests/generation-client.test.ts
tests/assistant-generation.test.ts
```

Do not begin by embedding networking directly throughout `App.svelte`; keep the API client and generation state isolated so the editor can reconnect after navigation or refresh.

## Frontend acceptance checklist

- [x] A landing prompt is carried to the editor and creates one backend job after the workspace is ready.
- [x] Manual prompts use the open project's real version/revision or create a new generated project.
- [x] Completion reloads the generated project source through the cloud project gallery.
- [x] API URL, editor URL, credentials, CSRF, upload paths, and response envelopes match the backend contract.
- [ ] Persist idempotency keys across transient submit retries and hard-disable every duplicate-submit path.
- [ ] Progress reconnects after temporary network loss and page refresh.
- [ ] Cancellation, failure, retry, and revision conflict have clear states.
- [ ] Verify the reloaded source version exactly matches the completion event before mounting.
- [ ] Every registered generated layer is selectable and editable through the existing runtime.
- [ ] Storyboard/timeline metadata comes from the generated `CompositionDefinition`.
- [ ] Preview and export continue to use the same mounted DOM and caller-owned GSAP timeline.
- [ ] No provider key, provider SDK, arbitrary generated script URL, or JSON animation layer is added to the frontend.

## Contract freeze checklist

Before frontend implementation begins, fetch `GET /openapi.json`, generate client types, and confirm:

- exact request/response fields;
- error envelope and error codes;
- SSE event names/data fields/replay semantics;
- asset upload lifecycle;
- authentication and CSRF behavior;
- how a completed source bundle is compiled/loaded by the deployed frontend;
- whether `styles.css` remains part of the transport envelope.
