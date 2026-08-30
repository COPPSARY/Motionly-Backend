# Security

## Trust boundaries

User-authored TypeScript is untrusted. It must never be compiled or executed in the API process. The renderer uses an isolated, disposable environment with CPU, memory, process, filesystem, and time limits.

Render jobs must not access host credentials or internal networks. Each job mounts only the pinned project source and explicitly referenced assets, and may use only approved dependencies or a locked dependency manifest.

## Tenant isolation

Every project, asset, and render operation is authorized at the workspace boundary. Membership roles are `owner`, `editor`, and `viewer`; cross-workspace reads and mutations must be denied by both service-layer authorization and database policies.

## Data protection

- Store asset and render binaries in private object-storage buckets, not PostgreSQL.
- Issue short-lived signed upload and download URLs.
- Validate asset size, filename extension, MIME type, and content before use.
- Never send database credentials, storage credentials, service-role keys, or authentication secrets to the browser.
- Redact secrets and internal exception details from responses and logs.

## Operational controls

- Use request-size limits and rate limits for public endpoints.
- Use safe machine-readable error codes and user-safe error messages.
- Track attempts, timeouts, cancellation, retries, and cleanup for render jobs.
- Record security-relevant audit events when team collaboration is introduced.
- Test that users cannot access another workspace's resources.
