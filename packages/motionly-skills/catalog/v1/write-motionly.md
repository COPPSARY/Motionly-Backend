# Write Motionly compositions

Build a directed product film, not decorated slides. Every visual change should explain, intensify, or resolve the current thought.

## Source architecture

- Treat `composition.html` and `styles.css` as the visual source of truth.
- Put all animation in `timeline.js` on the caller-owned GSAP timeline.
- Keep `index.ts` limited to metadata, mounting, asset substitution, and one timeline-builder call.
- Preserve stable `data-edit` ids and register important editable elements.
- Never introduce a `.motion` file, JSON animation DSL, generated DOM in TypeScript, conversion layer, or second renderer.

## Story and composition

- Build a clear progression: hook, friction, consequence, product turn, proof, and resolution.
- Give every beat one spoken thought, one focal subject, one primary action, and one transition destination.
- Use at least three connected beats for a new composition when duration permits.
- Prefer one persistent visual world with shared colors, surfaces, and shapes across scenes.
- Use real supplied assets and authentic product UI when available; do not invent decorative dashboards as proof.

## Editorial typography

- Express each beat as one bold, complete sentence with a clear hierarchy.
- Center the thought as one unit with `left: 50%`, `top: 50%`, `xPercent: -50`, and `yPercent: -50` when absolutely positioned.
- Use intentional type scale, readable line-height, strong contrast, and safe bounds for the target aspect ratio.
- Animate words or characters in reading order with restrained stagger; keep punctuation attached and preserve spaces.
- Give the completed sentence a real reading hold before departure.

## Styling and placement

- Define a coherent palette, type system, spacing scale, and background hierarchy in CSS variables.
- Use a base field, subtle structure, low-frequency ambient motion, and one semantic accent behind the focal subject.
- Use fixed or constrained dimensions for stages, cards, controls, counters, and text blocks so animation cannot cause reflow.
- Establish explicit responsive or aspect-ratio-safe placement; never rely on arbitrary coordinates that only work at one size.
- Avoid title-plus-subtitle slides, tiny UI, generic cards, repeated full-screen fades, simultaneous movement of every layer, and decoration with no narrative purpose.

## Motion and determinism

- Give each beat an arrival, settle, readable hold, and departure.
- Prefer morphs, match-cuts, or particle reassembly for scene handoffs; use opacity only for internal cleanup.
- Use `back.out(...)` for tactile text and controls and `power3.inOut` or `power4.inOut` for camera and geometry.
- Set every hidden, transformed, and layered initial state at time zero.
- Keep scene and track metadata truthful to the authored timeline and preserve preview/export parity.

## Reference preset

The vendored `packages/motionly-runtime/reference/motionly-promo` files are a pattern library, not source to copy literally. Study their persistent morph carrier, semantic HTML layers, CSS variable system, editorial typography, explicit zero-time state, overlapping handoffs, readable holds, and truthful scene metadata. Adapt those patterns to the user's subject, copy, assets, and duration; do not copy its brand, exact colors, timestamps, or frontend-only imports.