# Self-hosting

## Requirements

- Node.js 20.19 or newer for the API and renderer.
- PostgreSQL for application data.
- S3-compatible object storage for assets and render artifacts.
- A durable queue provider for render jobs.
- An OIDC-compatible identity provider, or the development authentication adapter for local use.

Supabase can provide PostgreSQL, authentication, and storage, but it is optional. A self-hosted installation can use ordinary PostgreSQL, any compatible OIDC provider, and MinIO or another S3-compatible storage service.

## Local development

Run the API and renderer on the developer machine. Docker Compose supplies PostgreSQL and MinIO. Copy `.env.example` to `.env` and configure values appropriate to the local services.

The frontend points to the API through:

```env
VITE_MOTIONLY_API_URL=http://localhost:4000
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
    `---- OIDC provider
```

Keep object storage private and expose it only through signed URLs. Run renderer workers separately from the API and apply resource limits plus network isolation. Pin renderer images and dependencies to retain reproducible rendering of historical source versions.

## Operations

Production deployments should include database backup and restore procedures, monitoring for API and queue health, render-job dashboards, graceful API shutdown, worker job draining, and dependency/container vulnerability scanning.
