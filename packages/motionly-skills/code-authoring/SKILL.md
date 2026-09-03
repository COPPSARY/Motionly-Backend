---
name: code-authoring
description: Author safe Motionly HTML, CSS, GSAP timeline, and adapter source files.
---

# Code authoring

`composition.html` owns semantic markup, inline SVG, and scoped styles. `timeline.js` exports a builder that receives `{ root, timeline, register }`. Query only inside `root`, validate required targets, register selectable elements, and add GSAP operations to `timeline` or a nested timeline attached to it.

`index.ts` may import raw HTML/assets, define scenes/tracks, mount a template, and invoke the builder. It must not recreate DOM elements, motion, or a parallel state model. Keep source deterministic and free of remote/active HTML, runtime network or navigation APIs, browser storage/credential access, cross-window messaging, filesystem APIs, and child processes. Use only the staged asset manifest for media.

Use `@motionly/runtime` from `index.ts` and optionally `@motionly/presets` from `timeline.js`; do not invent package imports.
