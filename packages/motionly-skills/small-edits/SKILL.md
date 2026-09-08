---
name: small-edits
description: Make focused, minimal source changes for narrow Motionly edit requests.
---

# Small Motionly edits

Use this skill for narrow requests such as changing text, color, font size, spacing, visibility, one short text layer, or one timing value in an existing project.

- Treat the current `compositionHtml` and `timelineJs` as the design to preserve. Do not redesign scenes or invent copy.
- Return the complete schema-constrained project, but change only the source and metadata required by the request.
- Inspect `compositionHtml` first; change `timelineJs` only when animation, registration, or timing requires it.
- Preserve existing `data-edit` IDs, matching `register(...)` calls, scenes, timeline relationships, and unaffected styles.
- For color or typography, update the existing scoped selector or semantic element. Do not add a layer unless requested.
- To add one text layer, add one semantic element with a unique stable `data-edit`, query and register that same ID, then animate it on the provided timeline. Preserve other scenes and copy.
- For animated properties, update both zero-time and destination values when needed so seeking stays deterministic.
- Confirm the requested change is present and unrelated source remains intact before returning the complete project.