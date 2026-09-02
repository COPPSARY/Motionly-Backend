# Self-hosting

## Requirements

- Node.js 22.12 or newer for the API and renderer (required by the pinned Chromium client).
- A Supabase project for PostgreSQL application data and authentication.
- Writable private storage for assets and artifacts (local filesystem in V1; S3-compatible adapter planned).
- PostgreSQL for the built-in durable lease queue.
- Docker plus a built `motionly-renderer` image for isolated validation/capture/export.
- A Gemini API key for the first implemented model adapter.
- A Supabase Auth project with email authentication and the Google provider enabled.

The Authentication implementation uses the same Supabase project for Auth and PostgreSQL. Drizzle connects through the project's standard PostgreSQL connection string; it does not use the Supabase Data API.

## Local development

Run the API and generation worker on the developer machine while Supabase supplies PostgreSQL and Auth. Docker runs each untrusted validation/render operation. Copy `.env.example` to `.env`, then copy the database URI from the Supabase dashboard's Connect panel.

Configure the Supabase project with email confirmation and Google login. In **Authentication > URL Configuration**, add both `API_PUBLIC_URL/v1/auth/verify` and `API_PUBLIC_URL/v1/auth/callback` to the allowed redirect URLs.

Keep the default confirmation link (`{{ .ConfirmationURL }}`) in **Authentication > Email Templates > Confirm signup**. Supabase redirects it to `API_PUBLIC_URL/v1/auth/verify?code=...`, where the API exchanges the PKCE code and creates the Motionly session. Because the verifier is held by the API process that initiated signup, complete local verification without restarting that process. Generate `SESSION_ENCRYPTION_KEY` with the command documented in `.env.example`.

The frontend points to the API through:

```env
VITE_MOTIONLY_API_URL=http://localhost:3000
```

When this variable is omitted, the Motionly frontend remains a local editor and uses browser downloads.

Build and start the backend components:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run docker:build:renderer
npm.cmd run build
npm.cmd start
npm.cmd run start:generation-worker
```

`AI_PROVIDER=gemini` is the only executable provider in V1. `AI_MODEL` can override the configured model ID; otherwise `GEMINI_MODEL` is used. OpenAI, Anthropic, and OpenAI-compatible environment placeholders reserve the adapter boundary but their workers intentionally fail closed until those adapters are implemented.

After setting a real server-only Gemini key, run `npm.cmd run eval:gemini-smoke` once per model/configuration to verify function calling and image input with synthetic data. The command contacts Gemini and is intentionally excluded from default CI.

## Production topology

```text
Reverse proxy
    |
Replicated API processes
    |---- PostgreSQL with backups
    |---- private object storage
    |---- PostgreSQL lease queue ---- generation worker(s)
    |                                  `---- isolated renderer containers
    `---- OIDC 
```

Keep object storage private and authorize every API download. Run generation workers separately from the API; keep renderer containers credential-free and network-disabled. Pin renderer images, fonts, runtime, and dependencies to retain reproducible rendering of historical source versions.

## Operations

Production deployments should include database backup and restore procedures, monitoring for API and queue health, render-job dashboards, graceful API shutdown, worker job draining, and dependency/container vulnerability scanning.

Use `GET /health` as the process liveness probe and `GET /ready` as the traffic-readiness probe. Readiness executes a lightweight PostgreSQL query and returns `503 {"status":"not_ready"}` without dependency details when the database is unavailable.
