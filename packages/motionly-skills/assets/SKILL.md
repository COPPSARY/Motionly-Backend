---
name: assets
description: Use project-provided asset references safely and preserve their visual fidelity in Motionly compositions.
---

# Assets

Use only asset references explicitly supplied in the request or already present in the current `compositionHtml`. Never invent paths, expose storage identifiers, or fetch media at runtime. If no usable asset reference is present, create the composition without external media rather than fabricating one.

Place supplied references directly in appropriate semantic HTML/SVG attributes inside the template. Preserve exact copy and intrinsic aspect ratios; use deliberate `object-fit`, crop, sizing, and focal placement. Give user-meaningful media layers stable `data-edit` IDs and matching registrations.

Do not add remote scripts, styles, fonts, or unapproved URLs. Keep existing safe asset references intact during unrelated edits. Remove filters, masks, and backdrop layers when their narrative beat ends so later scenes and the final frame remain clean.