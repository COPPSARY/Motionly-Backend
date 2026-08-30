# Motionly Backend

The backend service for [Motionly](../motionly), a code-first motion graphics editor built around TypeScript compositions, HTML/SVG, GSAP timelines, and direct browser preview.

This repository will provide the optional server-side capabilities required for hosted and self-hosted Motionly installations: authentication, workspaces, project persistence, source versioning, asset storage, render jobs, and collaboration infrastructure.

> [!IMPORTANT]
> TypeScript compositions remain the only project source. The backend must not introduce a JSON animation document, a second project representation, an interpreter, or a separate rendering model. Preview and rendering must continue to use `CompositionDefinition.build()`.

## Project status

Phase 2 is implemented: PostgreSQL/Drizzle persistence, Supabase email and Google authentication, opaque server-side sessions, personal-workspace provisioning, and role-based workspace membership APIs. Project persistence and rendering remain roadmap work.

## Goals

- Keep Motionly usable as a local, frontend-only open-source editor.
- Add an optional backend for accounts, teams, saved projects, assets, and rendering.
- Make the backend straightforward to self-host.
- Keep infrastructure provider-independent through small adapters.
- Preserve TypeScript composition source without converting it to another format.
- Separate interactive API work from resource-intensive rendering.
- Establish secure multi-tenant access from the first database migration.

## Non-goals

- Replacing the existing Motionly composition runtime.
- Defining a JSON-based animation or project DSL.
- Executing user-authored TypeScript inside the API process.
- Storing large binary media directly in PostgreSQL.
- Splitting the first release into many independently deployed microservices.
- Implementing realtime collaborative editing before normal save/version conflict handling is reliable.

## Proposed technology stack

| Concern | Default implementation | Portability boundary |
| --- | --- | --- |
| Runtime | Node.js 20.19 or newer | Standard Node.js deployment |
| Language | TypeScript | Shared types with the Motionly ecosystem |
| HTTP API | Express.js | OpenAPI is the client contract |
| Validation | Zod | Request and response schemas remain framework-neutral |
| Database | Supabase PostgreSQL | Standard PostgreSQL accessed through Drizzle |
| ORM and migrations | Drizzle ORM and Drizzle Kit | Generated SQL migrations are committed |
| Authentication | Adapter-based JWT/OIDC authentication | Supabase Auth can be the first adapter |
| Object storage | Deferred to Phase 4 | Provider will be selected when asset storage is implemented |
| Job queue | Queue adapter | PostgreSQL/Supabase Queues initially; Redis/BullMQ when needed |
| Rendering | Separate Node.js worker in an isolated container | Never runs inside the API process |
| Local development | Supabase | Supabase provides database and authentication |
| API documentation | OpenAPI | Used to generate or verify frontend contracts |
| Testing | Vitest plus integration tests | Testcontainers or Docker Compose for infrastructure tests |

Motionly uses one Supabase project for PostgreSQL and authentication. The API connects directly to the project's PostgreSQL endpoint through Drizzle and calls Supabase Auth through its HTTPS API.

## System architecture

```text
Motionly web editor
        |
        | HTTPS / JSON
        v
Motionly API
  |     |       |
  |     |       +--------> S3-compatible object storage
  |     |                    assets and render artifacts
  |     |
  |     +----------------> PostgreSQL
  |                          users, workspaces, projects,
  |                          source versions and job state
  |
  +----------------------> Durable render queue
                                  |
                                  v
                         Isolated render worker
                                  |
                                  +----> object storage
                                  +----> render-job progress
```

The first implementation is a modular monolith with two processes:

1. **API process** — authentication, authorization, project operations, asset metadata, signed URLs, and render-job submission.
2. **Renderer process** — claims queued work, compiles and mounts a pinned TypeScript composition version, exports frames/video, uploads artifacts, and reports progress.

Only the renderer is separated from the API initially. Additional microservices should be introduced only when measured operational requirements justify them.

## Proposed repository structure

```text
motionly_backend/
├─ apps/
│  ├─ api/
│  │  └─ src/
│  │     ├─ app.ts
│  │     ├─ server.ts
│  │     ├─ config/
│  │     ├─ middleware/
│  │     └─ modules/
│  │        ├─ auth/
│  │        ├─ health/
│  │        ├─ workspaces/
│  │        ├─ projects/
│  │        ├─ assets/
│  │        └─ renders/
│  └─ renderer/
│     └─ src/
│        ├─ worker.ts
│        ├─ compiler/
│        ├─ sandbox/
│        ├─ exporters/
│        └─ progress/
├─ packages/
│  ├─ contracts/             # Shared request/response schemas
│  ├─ database/              # Drizzle schema and database client
│  ├─ auth/                  # Authentication interfaces and adapters
│  ├─ storage/               # Object-storage interface and adapters
│  ├─ queue/                 # Render-queue interface and adapters
│  ├─ observability/         # Logging, tracing, and metrics helpers
│  └─ config/                # Shared TypeScript, lint, and test config
├─ drizzle/
│  └─ migrations/
├─ docs/
│  ├─ architecture.md
│  ├─ api.md
│  ├─ security.md
│  └─ self-hosting.md
├─ docker-compose.yml
├─ Dockerfile.api
├─ Dockerfile.renderer
├─ .env.example
├─ package.json
└─ README.md
```

## Source-of-truth boundary

A Motionly project is TypeScript source implementing `CompositionDefinition`. The backend stores that source as text and maintains immutable versions of it.

The visual editor may keep temporary overrides in browser memory while a user is interacting, but a saved edit must become a TypeScript source change. Persisting visual overrides as an independent animation document would create two competing sources of truth and is not permitted.

Compilation output may be cached as a derived artifact. It is never the editable project source and can always be regenerated from a pinned source version and its dependencies.

## Initial database model

### `profiles`

Application profile information associated with the identity supplied by the configured authentication provider.

| Column | Purpose |
| --- | --- |
| `id` | UUID matching the authenticated user identifier |
| `display_name` | User-facing name |
| `avatar_url` | Optional profile image |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### `workspaces`

| Column | Purpose |
| --- | --- |
| `id` | Workspace UUID |
| `name` | Display name |
| `slug` | Stable URL identifier |
| `owner_id` | Owning user |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### `workspace_members`

| Column | Purpose |
| --- | --- |
| `workspace_id` | Workspace reference |
| `user_id` | Member reference |
| `role` | `owner`, `editor`, or `viewer` |
| `created_at` | Membership timestamp |

The `(workspace_id, user_id)` pair is unique. Authorization must be checked at the workspace boundary for every project, asset, and render operation.

### `projects`

| Column | Purpose |
| --- | --- |
| `id` | Project UUID |
| `workspace_id` | Owning workspace |
| `name` | Project name |
| `slug` | Workspace-local URL identifier |
| `width` / `height` | Composition dimensions |
| `fps` | Composition frame rate |
| `duration` | Composition duration in seconds |
| `current_version_id` | Published/current source version |
| `revision` | Optimistic-concurrency counter |
| `created_by` | Creator identifier |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |
| `archived_at` | Optional soft-delete timestamp |

### `project_versions`

| Column | Purpose |
| --- | --- |
| `id` | Version UUID |
| `project_id` | Project reference |
| `version_number` | Monotonically increasing project version |
| `source_text` | Complete TypeScript composition source |
| `source_hash` | Content hash used for integrity and deduplication |
| `message` | Optional version description |
| `created_by` | Author identifier |
| `created_at` | Creation timestamp |

Versions are immutable. A render job always references a specific version rather than whatever source happens to be current when the worker starts.

### `assets`

| Column | Purpose |
| --- | --- |
| `id` | Asset UUID |
| `workspace_id` | Owning workspace |
| `object_key` | Private object-storage key |
| `original_name` | Original filename |
| `mime_type` | Verified MIME type |
| `byte_size` | File size |
| `checksum` | Content checksum |
| `metadata` | JSON metadata such as dimensions and duration |
| `created_by` | Uploader identifier |
| `created_at` | Creation timestamp |

Binary content is stored in object storage, not in PostgreSQL.

### `project_assets`

| Column | Purpose |
| --- | --- |
| `project_id` | Project reference |
| `asset_id` | Asset reference |
| `alias` | Stable name used by the composition |

### `render_jobs`

| Column | Purpose |
| --- | --- |
| `id` | Job UUID |
| `project_id` | Project reference |
| `project_version_id` | Immutable source version to render |
| `status` | `queued`, `running`, `completed`, `failed`, or `cancelled` |
| `format` | `png`, `webm`, or `mp4` |
| `width` / `height` | Requested output size |
| `fps` | Requested output frame rate |
| `progress` | Normalized progress value |
| `attempt_count` | Processing attempts |
| `error_code` | Safe machine-readable failure code |
| `error_message` | Safe user-facing failure message |
| `requested_by` | Requesting user |
| `created_at` | Submission timestamp |
| `started_at` | Processing timestamp |
| `completed_at` | Completion timestamp |

### `render_artifacts`

| Column | Purpose |
| --- | --- |
| `id` | Artifact UUID |
| `render_job_id` | Parent render job |
| `object_key` | Private output-storage key |
| `mime_type` | Output MIME type |
| `byte_size` | Output size |
| `checksum` | Output checksum |
| `created_at` | Creation timestamp |

## Initial API contract

All endpoints are versioned under `/v1`. JSON responses use consistent error objects with a stable code, user-safe message, request identifier, and optional field details.

### System

```text
GET    /health
GET    /ready
GET    /openapi.json
```

### Workspaces

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

### Projects and source versions

```text
GET    /v1/workspaces/:workspaceId/projects
POST   /v1/workspaces/:workspaceId/projects
GET    /v1/projects/:projectId
PATCH  /v1/projects/:projectId
DELETE /v1/projects/:projectId
GET    /v1/projects/:projectId/source
PUT    /v1/projects/:projectId/source
GET    /v1/projects/:projectId/versions
GET    /v1/projects/:projectId/versions/:versionId
POST   /v1/projects/:projectId/versions/:versionId/restore
```

Saving source requires the last known project revision. A stale revision returns `409 Conflict` with enough information for the editor to reload or reconcile changes without silently overwriting another edit.

### Assets

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

Uploads use short-lived signed URLs so large files travel directly between the browser and object storage. Completion verifies the stored object before creating or activating the asset record.

### Rendering

```text
GET    /v1/projects/:projectId/renders
POST   /v1/projects/:projectId/renders
GET    /v1/renders/:renderId
POST   /v1/renders/:renderId/cancel
POST   /v1/renders/:renderId/retry
GET    /v1/renders/:renderId/artifacts
GET    /v1/render-artifacts/:artifactId/download
```

Render submission returns `202 Accepted`. Clients poll job state initially; server-sent events or WebSockets can be added later without changing the underlying job model.

## Frontend integration

The Motionly frontend remains independently runnable. Server features are enabled only when an API URL is configured.

```env
VITE_MOTIONLY_API_URL=http://localhost:3000
```

Expected behavior:

- Without an API URL, Motionly continues to run as a local editor with browser downloads.
- With an API URL, Open and Save operate on persisted projects and immutable versions.
- Asset import uses the backend's signed-upload workflow.
- Export can submit remote render jobs while retaining local PNG frame export.
- The frontend never receives database credentials, storage service credentials, or authentication service secrets.

Shared contracts should be published as a small versioned package such as `@motionly/contracts`, or generated from the backend OpenAPI document. The backend must not import frontend UI code.

## Security model

User-authored TypeScript must be treated as untrusted code.

- Never compile or execute compositions in the API process.
- Run rendering in an isolated, disposable environment with CPU, memory, process, filesystem, and time limits.
- Deny access to host credentials and internal networks from render jobs.
- Mount only the pinned project source and explicitly referenced assets.
- Allow only approved dependencies or a locked dependency manifest.
- Validate asset size, extension, MIME type, and content before use.
- Keep object-storage buckets private and issue short-lived signed URLs.
- Enforce workspace authorization in the service layer and database policies.
- Never expose service-role keys or database credentials to the browser.
- Redact secrets and internal exception details from API responses and logs.
- Use idempotency keys for render submission and other retryable mutations.
- Record security-relevant actions in an audit log when team collaboration is introduced.

## Configuration plan

The initial `.env.example` should document variables without containing usable secrets:

```env
NODE_ENV=development
API_HOST=0.0.0.0
API_PORT=3000
API_PUBLIC_URL=http://localhost:3000
FRONTEND_ORIGINS=http://localhost:5173
LOG_LEVEL=info

DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require

SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SESSION_ENCRYPTION_KEY=replace_with_base64_encoded_32_byte_key
SESSION_COOKIE_SECURE=false

QUEUE_PROVIDER=postgres
RENDER_JOB_TIMEOUT_SECONDS=900
RENDER_MAX_ATTEMPTS=3
```

Environment variables must be parsed and validated once at process startup. Invalid or missing production configuration should stop the process with a clear error.

## Implementation roadmap

### Phase 1 — Repository foundation

- Create npm workspaces for `apps/*` and `packages/*`.
- Add strict shared TypeScript configuration.
- Add linting, formatting, unit-test, type-check, and build scripts.
- Scaffold the Express.js API with `/health` and `/ready` endpoints.
- Add structured request logging and request IDs.
- Add environment validation and `.env.example`.
- Use Supabase for PostgreSQL and authentication.
- Add continuous integration for type-checking, tests, linting, and builds.

**Exit condition:** a fresh contributor can clone the repository, start dependencies, run the API, and receive successful health and readiness responses.

### Phase 2 — Database and authentication

- Define Drizzle schemas for profiles, workspaces, and memberships.
- Generate and commit the first SQL migration.
- Add transaction helpers and database health checks.
- Define the authentication-provider interface.
- Implement a development authentication adapter.
- Implement the first production JWT/OIDC or Supabase adapter.
- Add workspace role authorization and multi-tenant isolation tests.

**Exit condition:** authenticated users can create workspaces, manage allowed memberships, and cannot read or mutate another workspace.

### Phase 3 — Projects and source versioning

- Add project and immutable project-version tables.
- Implement project CRUD endpoints.
- Implement source loading and revision-aware saving.
- Add optimistic concurrency using the project revision.
- Add version history and restore operations.
- Define retention rules without deleting referenced render versions.
- Connect Motionly Open and Save actions to the API.

**Exit condition:** the frontend can create, open, edit, save, reload, and restore TypeScript composition source without introducing a second project representation.

### Phase 4 — Asset storage

- Define the storage-provider interface.
- Implement the S3-compatible adapter.
- Add signed upload and download endpoints.
- Verify uploads before creating active asset records.
- Extract safe metadata for supported media.
- Add project-to-asset aliases.
- Connect the Motionly asset panel to stored project assets.

**Exit condition:** authorized users can upload, reference, download, and remove project assets without proxying large file bodies through the API.

### Phase 5 — Render pipeline

- Define the queue-provider interface and durable job lifecycle.
- Add render submission, status, cancellation, and retry endpoints.
- Implement the isolated renderer process.
- Pin each job to a project source version and asset set.
- Start with PNG frame rendering.
- Add WebM and MP4 encoding after deterministic frame sequencing is verified.
- Upload outputs to object storage and create artifact records.
- Add timeouts, retries, progress reporting, and cleanup.

**Exit condition:** a submitted job can be processed outside the API request lifecycle and produces a downloadable artifact from a pinned source version.

### Phase 6 — Production hardening

- Add rate limits and request-size limits.
- Add audit events for sensitive operations.
- Add database backup and restore documentation.
- Add metrics, traces, alerts, and render-queue dashboards.
- Add graceful shutdown and job-draining behavior.
- Add dependency and container vulnerability scanning.
- Add end-to-end tests covering frontend-to-render flows.
- Publish production and self-hosting deployment guides.

**Exit condition:** the service has documented recovery procedures, operational visibility, bounded resource use, and repeatable deployments.

### Phase 7 — Collaboration

- Add presence separately from durable project state.
- Choose and document a collaborative text protocol.
- Reconcile collaborative changes into TypeScript source versions.
- Preserve normal revision and restore behavior.
- Add project-level sharing controls and audit history.

**Exit condition:** multiple editors can safely collaborate without bypassing TypeScript as the only persisted project source.

## Testing strategy

The repository should use multiple levels of verification:

- Unit tests for domain rules, validation, adapters, and authorization decisions.
- Database integration tests against real PostgreSQL migrations.
- API integration tests using the Express application with Supertest, without opening a public port.
- Storage contract tests shared by the selected Phase 4 adapters.
- Queue contract tests covering retries, duplicate delivery, cancellation, and stale jobs.
- Renderer fixtures for deterministic frames and expected failures.
- Security tests proving cross-workspace access is denied.
- End-to-end tests connecting a Motionly frontend build to the backend.

Every migration must be tested both from an empty database and from the previous released schema.

## Versioning and compatibility

- Version HTTP routes under `/v1`.
- Publish an OpenAPI document from the same schemas used for runtime validation.
- Keep backward-compatible API changes within a major API version.
- Store a composition-runtime compatibility version with saved source or render jobs when runtime versions begin to diverge.
- Pin renderer images and dependencies so an old source version remains reproducible.
- Use semantic versioning for releases and shared packages.

## Deployment profiles

### Local development

```text
API + renderer on the developer machine
Supabase PostgreSQL and Auth
```

### Simple hosted deployment

```text
API on a Node.js host
Renderer on a separate worker/container host
Supabase PostgreSQL
S3-compatible object storage
Supabase Auth
```

### Self-hosted production

```text
Reverse proxy
Replicated API processes
One or more isolated renderer workers
Supabase PostgreSQL with backups
S3-compatible storage
Configured OIDC provider
Durable queue
```

The backend does not require Vercel, but Phase 2 requires Supabase for PostgreSQL and authentication.

## Initial delivery checklist

The first implementation pull request should contain only the foundation needed for Phase 1 and the database start of Phase 2:

- [ ] Workspace-aware npm package structure
- [ ] API and renderer application placeholders
- [ ] Shared TypeScript and lint configuration
- [ ] Environment schema and `.env.example`
- [ ] Express.js health and readiness endpoints
- [x] Supabase PostgreSQL connection through `DATABASE_URL`
- [ ] Drizzle configuration and initial schema
- [ ] Generated SQL migration
- [ ] Unit and database integration test setup
- [ ] CI workflow
- [ ] Contributor startup documentation

Project CRUD, uploads, and rendering should follow in focused pull requests after this foundation is verified.

## Relationship to the frontend repository

Development may use sibling repositories:

```text
Desktop/
├─ motionly/
└─ motionly_backend/
```

Neither repository should reach into the other repository's source files at runtime. Local integration happens over HTTP. Shared types are exchanged through a published package or generated OpenAPI client so each repository can be cloned, tested, versioned, and deployed independently.

## License

Choose and add an open-source license before accepting external contributions. Using the same Apache-2.0 license as the Motionly frontend is the simplest default unless the maintainers intentionally want different terms.
