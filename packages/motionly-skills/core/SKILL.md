---
name: core
description: Apply the core code-first Motionly composition and runtime rules to every generation.
---

# Motionly generation core

Author a directed product film in semantic HTML/SVG and scoped CSS inside `composition.html`. Put all animation in `timeline.js` and add it to the caller-owned GSAP timeline. Keep `index.ts` limited to metadata, asset substitution, HTML mounting, and one timeline builder call.

Never create `.motion`, a JSON animation DSL, a generated-DOM representation in TypeScript, a conversion layer, or a second renderer. Preview and export must use the same mounted DOM and timeline.

Give each scene an arrival, active transformation, readable hold, and resolve. Preserve supplied copy and aspect ratios. Use one focal subject per shot. Register important editable elements with stable IDs and keep scene/track metadata truthful to the authored timeline.

Use real supplied assets when available. Initialize hidden/transformed states deterministically at time zero. Verify frame-quantized seeking, Play/Pause/Restart, registered selection, scene boundaries, final cleanup, and preview/export parity.
