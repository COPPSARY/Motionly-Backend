# Self-hosting

## Requirements

- Node.js 20.19 or newer for the API and renderer.
- A Supabase project for PostgreSQL application data and authentication.
- S3-compatible object storage for assets and render artifacts.
- A durable queue provider for render jobs.
- A Supabase Auth project with email authentication and the Google provider enabled.

The Authentication implementation uses the same Supabase project for Auth and PostgreSQL. Drizzle connects through the project's standard PostgreSQL connection string; it does not use the Supabase Data API.

## Local development

Run the API and renderer on the developer machine while Supabase supplies PostgreSQL and Auth. Copy `.env.example` to `.env`, then copy the database URI from the Supabase dashboard's Connect panel.

Configure the Supabase project with email confirmation and Google login. In **Authentication > URL Configuration**, add both `API_PUBLIC_URL/v1/auth/verify` and `API_PUBLIC_URL/v1/auth/callback` to the allowed redirect URLs.

Keep the default confirmation link (`{{ .ConfirmationURL }}`) in **Authentication > Email Templates > Confirm signup**. Supabase redirects it to `API_PUBLIC_URL/v1/auth/verify?code=...`, where the API exchanges the PKCE code and creates the Motionly session. Because the verifier is held by the API process that initiated signup, complete local verification without restarting that process. Generate `SESSION_ENCRYPTION_KEY` with the command documented in `.env.example`.

The frontend points to the API through:

```env
VITE_MOTIONLY_API_URL=http://localhost:3000
```

When this variable is omitted, the Motionly frontend remains a local editor and uses browser downloads.

## Production topology

```text
Reverse proxy
    |
Replicated API processes
    |---- PostgreSQL with backups
    |---- S3-compatible storage
    |---- durable queue ---- isolated renderer worker(s)
    `---- OIDC 
```

Keep object storage private and expose it only through signed URLs. Run renderer workers separately from the API and apply resource limits plus network isolation. Pin renderer images, dependencies, and the submitted job source snapshot to retain reproducible rendering after a project is saved again.

## Operations

Production deployments should include database backup and restore procedures, monitoring for API and queue health, render-job dashboards, graceful API shutdown, worker job draining, and dependency/container vulnerability scanning.
