---
name: rendering
description: Preserve deterministic preview and export behavior for Motionly source.
---

# Rendering

Preview and export must mount the same source through the same Motionly runtime. Verify real visual state changes, deterministic frame seeking, console errors, asset readiness, blank frames, clipping, stale layers, final cleanup, width/height/fps/duration, and representative frames.

Capture the first non-empty frame, scene arrivals/holds/resolves, transition midpoints, final frame, and timestamps implicated by diagnostics. Repair the source, then rerun every mandatory gate.
