---
name: scene-seams
description: Render-correctness rule for scene-to-scene handoffs in a single composition — why a transition can flash the page background and how to prevent it. Load when assembling a multi-scene timeline, or when a translucent flash appears at a cut or crossfade.
---

# Scene Seams

Several transition techniques (`transition-techniques`) open a window where the
outgoing and incoming scene groups' combined opacity dips below 1 — a directional cut's
mid-window swap, zoom-through's 0.15 floor, or a plain crossfade's power-curve dip.
Whatever sits *behind* the scene content shows through during that window.

Because every Motionly composition lives inside one `.stage`-style root element (see
`core`), that background must stay **opaque for the whole duration** — never
`transparent`, never fading in/out with the scene groups themselves. If it isn't, the
dip composites over whatever is behind the page instead, and every handoff flashes —
glaring on dark compositions.

- Set the stage's `background` once in the `<style>` block and never animate it to
  transparent or zero-opacity as part of a scene transition.
- If a scene genuinely needs a background color change, cross-fade the color itself
  (a paint-only tween) rather than fading the container's opacity to reveal a different
  element behind it.
- When two scene groups overlap during a handoff (see `transition-techniques`), the
  later scene group should composite on top of the earlier one at a higher effective
  stacking position — the earlier one holds its final frame until fully covered rather
  than disappearing early.

This is a render-correctness rule, not a per-transition catalog — see
`transition-techniques` for the individual handoff mechanics that create these overlap
windows.
