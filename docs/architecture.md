# Architecture

Motionly Backend is an optional, provider-independent service for the Motionly editor. Motionly remains usable as a local, frontend-only editor when no API URL is configured.

## Source of truth

A project is TypeScript source implementing `CompositionDefinition`. The backend stores the source as text and creates immutable versions whenever it is saved. It must not introduce a JSON animation document, a second project representation, an interpreter, or another rendering model.

Compilation output is a disposable derived artifact. It can be regenerated from a pinned source version and its dependencies; it is never editable project source.

## Processes

The initial deployment is a modular monolith with two processes:

- **API:** authentication, authorization, workspaces, projects, source versions, asset metadata, signed URLs, and render-job submission.
- **Renderer:** claims queued jobs, compiles a pinned project version in isolation, exports media, stores artifacts, and reports progress.

The renderer is intentionally separate from the API because user-authored source is untrusted and rendering is resource intensive.

```text
Motionly web editor
        |
        | HTTPS / JSON
        v
Motionly API ----> PostgreSQL
       |             users, workspaces, projects,
       |             versions, and job state
       |
       +-----------> S3-compatible object storage
       |             assets and render artifacts
       |
       +-----------> durable render queue ---> isolated renderer
```

## Boundaries

- PostgreSQL holds relational metadata and source text, never large binary media.
- S3-compatible storage holds private asset and artifact objects.
- The queue abstracts durable render-job delivery.
- Authentication, storage, and queue providers are implemented behind adapters.
- The backend never imports frontend UI code; frontend integration happens over HTTP and shared contracts.

## Repository layout

- `apps/api`: HTTP API process.
- `apps/renderer`: isolated render worker.
- `packages/*`: shared contracts, database, provider interfaces, observability, and tooling configuration.
- `drizzle/migrations`: committed database migrations.
- `docs`: operational and integration documentation.

## Development profiles

Local development runs the API and renderer on the developer machine, with PostgreSQL and MinIO provided by Docker Compose. Hosted and production profiles can use managed PostgreSQL, S3-compatible storage, and OIDC/Supabase Auth without changing the core model.
