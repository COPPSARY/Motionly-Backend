# Cloud AI Generation: Performance and Capacity Plan

Status: initial budget and measurement plan; production numbers are not yet established

## Principle

Optimize the queue-to-preview critical path with measurements from production-like jobs. Model latency, Chromium startup, screenshot count, and video frame count will dominate ordinary API/SQL overhead, so code-level micro-optimizations are lower priority than bounded work, concurrency control, caching immutable inputs, and separate worker pools.

## Initial service objectives

These are proposed V1 targets to ratify after the credentialed baseline run:

| Signal | Initial target |
|---|---|
| Generation submission API | p95 under 300 ms, excluding asset upload |
| Status polling API | p95 under 150 ms |
| SSE event propagation | p95 under 2 seconds from durable event write |
| Queue claim latency with idle capacity | p95 under 2 seconds |
| First visible progress | p95 under 5 seconds |
| Worker lease heartbeat | every one-third of lease duration |
| Representative screenshots | at most 8 sent to the model per review turn |
| Model/source repair attempts | at most 3 by default |
| Active jobs per user | at most 3 by default |
| Source prompt | at most 20,000 characters |
| Uploaded assets per generation | at most 50; 100 MB per asset |

End-to-end generation latency is reported by prompt class and provider/model rather than hidden behind one universal target.

## Existing efficiency controls

- Generation list/status queries are paginated and backed by job status/creator indexes.
- PostgreSQL queue claims use `FOR UPDATE SKIP LOCKED`, short ID-only payloads, renewable leases, and dead-letter limits.
- Source, binaries, screenshots, and video frames are not embedded in queue payloads; large artifacts live in private object storage.
- Browser asset uploads stream to storage with a hard declared-byte ceiling rather than buffering up to 100 MB in API memory.
- Skill routing loads only relevant, manifest-verified instructions within a character budget.
- Model source reads page at no more than 200,000 characters and expose `nextOffset`, preventing a single large legacy file from dominating a tool turn.
- Conversation assembly is anchored to the job's immutable prompt, ignores messages created after that job, fetches at most 50 prior rows, and forwards at most 60,000 history characters newest-first.
- Representative capture stratifies scene midpoints across the full timeline and always keeps the final frame; visual review then samples at most eight of those images evenly across the film.
- Export screenshots stream directly into FFmpeg with backpressure while their hashes are computed; the worker never stages a full PNG frame sequence on the bind-mounted workspace.
- Model use is bounded across the whole job by attempt, tool-turn, tool-call, token, image, and wall-clock budgets.
- Render operations share the same built composition for preview and export-source capture.
- API and generation/render work run in separate processes, allowing independent scaling.

## Required measurements before optimization

Record per job:

1. queue wait and lease recovery count;
2. context/skill assembly time and prompt byte/token counts;
3. provider latency, retries, tokens, and tool turns;
4. source validation and Vite build time;
5. Chromium launch, seek, and screenshot time;
6. FFmpeg frame/render/encode time and output bytes;
7. object upload/download time and bytes;
8. publication transaction time and conflict count;
9. total latency, cancellation latency, and peak worker memory/CPU.

Compare create vs edit, resolution/fps/duration buckets, asset count/bytes, prompt class, provider/model, repair count, and cold vs warm worker state. Do not log prompt/source contents.

## Scaling order

1. Separate generation orchestration and render/export queue task types so Chromium/FFmpeg cannot starve model/source work.
2. Scale stateless API instances independently from generation workers.
3. Add generation workers until queue age or provider quotas become the limit.
4. Add a distinct export pool for long videos and cap concurrent FFmpeg jobs per host.
5. Move local object storage to a shared S3-compatible adapter before adding multiple hosts.
6. Cache immutable runtime dependencies and starter/skill bundles by version/hash; never cache mutable project working directories.
7. Profile PostgreSQL only after production-like load identifies slow queries; add indexes from actual query plans.

## Load and regression tests

- API: concurrent submit/list/get/event-replay tests with authorization and idempotency.
- Queue: concurrent claims, lease expiration, worker loss, retry delay, and dead-letter saturation.
- Provider: scripted rate-limit/timeout bursts with bounded backoff and cancellation.
- Renderer: cold/warm build, 1080p and vertical compositions, asset-heavy scenes, and concurrent Chromium processes under container limits.
- Storage: upload/download/cleanup throughput with failure injection.
- Soak: at least one hour with mixed create/edit/cancel jobs and no workspace, process, event-listener, or artifact leaks.

A regression gate should compare medians and p95s against a checked-in benchmark report on the same machine/image. Fail only on statistically meaningful regressions, initially 20% or more, while always failing correctness, security, memory-limit, or cleanup violations.

## Current conclusion

No further micro-optimization is justified by the current local functional test set. The architecture already bounds the costly loops and avoids obvious N+1/large-payload patterns. The next useful optimization work is instrumentation plus a production-like benchmark on PostgreSQL, Docker, Gemini, and the selected shared object store.
