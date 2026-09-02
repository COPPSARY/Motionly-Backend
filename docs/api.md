# API

All public API routes are versioned under `/v1`, except system endpoints. Responses use JSON and errors provide a stable code, a user-safe message, a request identifier, and optional field details.

## System

```text
GET /health
GET /ready
GET /openapi.json
```

## Authentication

```text
POST /v1/auth/sign-up
POST /v1/auth/login
GET  /v1/auth/verify
GET  /v1/auth/google
GET  /v1/auth/callback
GET  /v1/auth/me
POST /v1/auth/logout
```

The backend owns the Supabase login flow and returns an opaque `motionly_session` HTTP-only cookie. Successful login responses also provide a session-bound CSRF token; clients must send it as `X-CSRF-Token` for cookie-authenticated mutations. Email signup requires verification in production. Supabase redirects confirmation links to `/v1/auth/verify?code=...`; the endpoint exchanges that PKCE code and creates the Motionly session. The Google endpoint starts a separate PKCE flow and accepts each stored attempt only once.

## Workspaces

```text
GET    /v1/workspaces
POST   /v1/workspaces
GET    /v1/workspaces/:workspaceId
PATCH  /v1/workspaces/:workspaceId
GET    /v1/workspaces/:workspaceId/members
POST   /v1/workspaces/:workspaceId/members
PATCH  /v1/workspaces/:workspaceId/members/:userId
DELETE /v1/workspaces/:workspaceId/members/:userId
```

## Projects and rolling source snapshot

```text
GET    /v1/workspaces/:workspaceId/projects
POST   /v1/workspaces/:workspaceId/projects
GET    /v1/projects/:projectId
PATCH  /v1/projects/:projectId
DELETE /v1/projects/:projectId
GET    /v1/projects/:projectId/source
PUT    /v1/projects/:projectId/source
```

Source saves include the caller's last-known project revision. When it is stale, the API returns `409 Conflict` so clients can reload or reconcile without silently overwriting another edit.

Creating a project stores its initial source snapshot. A changed save atomically replaces that snapshot and advances the project revision. If the submitted source hash is unchanged, the API returns `unchanged: true` without writing or advancing the revision. Deletion is a soft archive and also requires the current revision. Viewers may read projects; workspace owners and editors may mutate them.

```json
{
  "name": "Launch Film",
  "width": 1920,
  "height": 1080,
  "fps": 60,
  "duration": 30,
  "files": {
    "composition.html": "<main class=\"scene\">...</main>",
    "styles.css": ".scene { ... }",
    "timeline.js": "export function buildTimeline(context) { ... }",
    "index.ts": "export const launchFilm = defineComposition({ ... })"
  }
}
```

The `files` object is only an HTTP transport envelope for the four canonical authored files. It is not a JSON animation representation. `PATCH`, `PUT`, and `DELETE` requests include `revision`; stale writes return `REVISION_CONFLICT` with `details.currentRevision`.

## Assets

```text
GET    /v1/workspaces/:workspaceId/assets
POST   /v1/workspaces/:workspaceId/assets/uploads
POST   /v1/workspaces/:workspaceId/assets/uploads/:uploadId/complete
GET    /v1/assets/:assetId
GET    /v1/assets/:assetId/download
DELETE /v1/assets/:assetId
POST   /v1/projects/:projectId/assets
DELETE /v1/projects/:projectId/assets/:assetId
```

Large uploads use short-lived signed URLs. The completion endpoint verifies the stored object before the backend creates or activates its asset record.

## Rendering

```text
GET  /v1/projects/:projectId/renders
POST /v1/projects/:projectId/renders
GET  /v1/renders/:renderId
POST /v1/renders/:renderId/cancel
POST /v1/renders/:renderId/retry
GET  /v1/renders/:renderId/artifacts
GET  /v1/render-artifacts/:artifactId/download
```

Render submission returns `202 Accepted`. Clients initially poll job state; server-sent events or WebSockets may be added later without changing the job model. Retryable mutations should accept idempotency keys.
