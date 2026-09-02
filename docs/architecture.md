# Architecture

Motionly Backend is an optional, provider-independent service for the Motionly editor. Motionly remains usable as a local, frontend-only editor when no API URL is configured.

## Source of truth

A project consists of four authored source files: `composition.html`, `styles.css`, `timeline.js`, and a thin `index.ts` adapter implementing `CompositionDefinition`. The backend stores those files as an immutable bundle whenever the project is saved. It must not introduce a JSON animation document, a second project representation, an interpreter, or another rendering model.

Compilation output is a disposable derived artifact. It can be regenerated from a pinned source version and its dependencies; it is never editable project source.

## Processes

The cloud-generation deployment is a modular monolith with three process boundaries:

- **API:** authentication, authorization, workspaces, projects, source versions, asset lifecycle, generation submission/status/SSE, and private artifact downloads.
- **Generation worker:** leases generation tasks, calls the configured model provider, routes versioned Motionly skills, applies typed source edits, and controls repair/publication.
- **Renderer sandbox:** compiles and executes a staged source snapshot with Chromium/FFmpeg and no model, database, or storage credentials.

The trusted generation worker is separate from the API, and user-authored code crosses another boundary into a disposable renderer container because it is untrusted and resource intensive.

```text
Motionly web editor
        |
        | HTTPS / JSON
        v
Motionly API ----> PostgreSQL queue + records
       |             users, projects, versions, jobs,
       |             events, attempts, and outputs
       |
       +-----------> private object storage
       |             assets and generation artifacts
       |
       +-----------> generation worker ---> isolated renderer
```

## Boundaries

- PostgreSQL holds relational metadata and immutable project source files, never large binary media.
- Private object storage holds asset and artifact objects. V1 includes a local-filesystem adapter; an S3-compatible adapter is the production extension point.
- The queue abstracts durable render-job delivery.
- Authentication, storage, and queue providers are implemented behind adapters.
- The backend never imports frontend UI code; frontend integration happens over HTTP and shared contracts.

## Repository layout

- `apps/api`: HTTP API process.
- `apps/generation-worker`: trusted queue/provider orchestration.
- `apps/renderer`: fixed validation/capture/export entry point used in the isolated image.
- `packages/*`: shared contracts, database, provider interfaces, observability, and tooling configuration.
- `drizzle/migrations`: committed database migrations.
- `docs`: operational and integration documentation.

## Development profiles

Local development runs the API and renderer on the developer machine and uses Supabase PostgreSQL and Auth. Hosted and production profiles use the same Supabase project for database and authentication.
