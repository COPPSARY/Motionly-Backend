---
name: motion-rules
description: A catalog of atomic GSAP motion recipes for text, data, camera, layout, SVG, ambient, and transition effects — kinetic type, count-ups, chart scrubs, camera zoom/pan/flight, scatter/assemble layouts, SVG draw-on, idle glow, spring pops, particle bursts, and more. Compose two to four per scene.
---

# Motion Rules

Atomic motion recipes. Compose 2–4 per scene on the one shared `timeline` your
`buildTimeline` builds.

## The contract — every rule assumes this

Stated once here so individual rules don't repeat it:

- runs on the single `timeline` passed into `buildTimeline` — never construct a second
  timeline or call GSAP directly on `document`;
- is **seek-safe both directions**: `fromTo` with explicit from-states (correct at t=0
  under seek), absolute values — never relative `+=` tweens; state should be a pure
  function of timeline time, not a mutable tracker;
- is **deterministic**: no `Math.random()`, no `Date.now()` — index-derived
  pseudo-random and baked schedules only; finite repeats, never `repeat: -1`;
- animates **transforms and paint-only properties** — avoid `width`/`height`/`top`/`left`
  tweens where a `scale`/`translate` proxy, a mask, or a layout-authored-expanded state
  will do;
- caps group staggers so an arrival reads as one beat (`items × stagger ≤ ~0.5s`);
- puts no CSS `transition` on animated elements (they'd interpolate independently of
  seek and flicker), and hints `will-change: transform` where many tweens run at once;
- gives every animated or edited element a stable `data-edit` id, registered via
  `register(id, element)` per `core`.

## Text & Typography

- **Character-level 3D decode** — per-character 3D rotation with deterministic glyph
  substitution (a hash of quantized timeline time, never random), `back.out` ease.
- **Vertical spring ticker** — slot-machine vertical scrolling using stepped tweens
  within a masked column.
- **Counting dynamic scale** — a counter where transform scale grows with the value for
  escalating emphasis; a numeric proxy and scale tween share one timeline position.
- **Discrete text sequence** — replace entire text states at time thresholds for
  non-linear typing (typos, holds, bulk additions, backspaces) via an `onUpdate`-driven
  reverse search over a baked array of `{time, text}` entries.
- **Keyword glow highlight** — highlight a word with glow + scale + color via a CSS
  custom property tweened through an attack-decay-rest envelope.
- **Stacked depth text** — multiple offset text layers with decreasing opacity create a
  3D-extrusion illusion on large typography.
- **Context-sensitive caret** — a typing caret whose color switches at segment
  boundaries, plus a square-wave blink via `(timeline.time() % cycle) < cycle / 2`.
- **Content-driven sequencing** — pre-compute a flat `[{startTime, endTime, ...}]`
  array from a script of phrases; each phrase's window = `chars × charSpeed + hold`, so
  duration is content-driven, not hand-tuned.
- **Kinetic beat slam** — short phrases slam in on one shared beat grid with distinct
  per-phrase entrances (scale-slam / side-snap / rise-rotate), then a locked finale. The
  recipe for a punchy, rhythmic tagline.
- **Gradient text sweep** — a gradient tweened through letterforms via
  `background-clip: text` plus an oversized `background-position` tween. Glyphs never
  move; finite and seek-safe.
- **Chromatic glitch** — an RGB-split/slice glitch that snaps sharp: offset color
  copies jitter on a deterministic hash of quantized time, or horizontal slice bands
  displace and converge under a stepped ease; brief vibration, clean resolve.
- **Waterfall entry / nudge curve** — see `transition-techniques` §6–7.

## Data & Stats

- **Growth bars / progress fill / rating wipe** — pair a number with a graphic: growth
  bars via staggered `scaleY`, a progress fill via `scaleX` or a measured SVG ring, a
  fractional star rating via `clip-path`. Transforms only, seek-safe.
- **Chart scrub readout** — a single driver moves a tracking line/marker along an
  already-drawn data polyline while a value tooltip steps through the data array (text
  writes only on index change). The chart's own draw-on belongs to the SVG rules below;
  this is the read head.

## Camera & Viewport

- **Coordinate target zoom** — zoom into a non-centered element via scale on an outer
  wrapper plus counter-translation on an inner wrapper.
- **Cursor tracking camera** — a two-phase virtual camera that locks the viewport to a
  moving focal point (e.g. a typing caret): static initial framing, then focal-point-
  locked tracking.
- **Multi-phase camera** — a sequential zoom system (pull-back / focus / push) plus
  continuous micro-drift.
- **Viewport transform** — simulate zoom/pan/focus-lock by transforming a single
  full-scene wrapper: one composite `translate(x, y) scale(S)`.
- **3D camera flight** — a perspective camera that travels through a 3D-laid-out
  scene: one static `perspective` stage plus a `preserve-3d` world whose pose
  (`translate3d` + `rotateX`/`rotateY`) is tweened leg-by-leg. `power4.out` landings,
  `power2.inOut` repositioning. The only camera move that rotates/travels in Z — the
  others are 2D scale+translate.
- **Rack focus (depth of field)** — selective blur: tween `filter: blur()` (plus a
  slight opacity dim) on off-focus layers while the focal element stays sharp.

## Layout & Network

- **Node network** — items on an elliptical ring with connection lines to a center
  point, staggered entry; the ring's center must match the centerpiece element exactly.
- **Center-outward expansion** — elements start clustered at screen center and expand
  outward to final positions; each element's target position is set via CSS once, and
  a shared driver tweens the transform offsets to zero in lockstep.
- **Split tilt cards** — two elements side by side with opposing tilt (`rotationY`)
  and entry slides from their respective sides; continuous floating runs in phase
  opposition.
- **Orbit entry** — elements flip in from 3D space then settle into a continuous
  elliptical orbit. Critical: set the entry pose at the orbital starting position
  *before* animating phase 1, not at scene center.
- **Scatter / assemble** — N elements scatter into, or reassemble from, a rotating 3D
  depth cloud; each starts at a deterministic index-derived 3D offset and settles to a
  clean flat layout.
- **Anchored expand/collapse** — an edge-pinned container grows or collapses along one
  axis and in-flow content reflows; transform-only (mask + slide, or a scale proxy with
  a counter-scale on the content) since width/height tweens are avoided. The push on
  following content shares the same tween so the seam never separates.

## SVG & Icons

- **Icon micro-animation** — animate internal SVG parts (rotating hands, oscillating
  blades, pulsing dots, dash-flow lines) so an icon feels alive. Use SVG-native
  `setAttribute('transform', 'rotate(deg cx cy)')` for an explicit rotation center — CSS
  `transform-origin` on a thin line interprets origin in bbox-local coordinates and
  drifts off-center.
- **Path draw-on** — an SVG outline draws itself via `stroke-dasharray` /
  `stroke-dashoffset`: measure with `getTotalLength()` at build time, set the initial
  dashoffset to the length, tween to 0. For a circular progress ring, rotate the stroke
  -90° so drawing starts at 12 o'clock.

## Idle & Ambient

- **Breathing loop** — continuous idle motion via a `sine.inOut` yoyo with finite
  repeats, or by reading `timeline.time()` in an `onUpdate` when multiplying onto
  another live value. Use sparingly — see `motion-continuity`'s ban on idle wobble as
  *sustained* motion.
- **Ambient glow bloom** — an un-triggered soft radial glow that blooms in behind a
  hero element and holds with a bounded idle breathe, or a single-pass traveling sheen.
  Peak opacity ≤ ~0.45, finite and deterministic.

## Interaction & Transition

- **Reactive displacement** — a physical-collision transition where an entering
  element's tween drives the exiting element's displacement; concurrent tweens at the
  same timeline position, with the displaced element's duration at 40–50% of the
  intruder's.
- **Press-release spring** — a tactile button press: linear compression then spring
  recovery via two adjacent tweens on the same property.
- **Physics press reaction** — a physical click simulation: two sequential scale tweens
  (down to ~0.9, up to 1.0) approximate a spring with overshoot; compress the cursor
  and the target together for tactile contact.
- **Click ripple** — a cursor moves to a target, depresses cursor and target together
  on click, and emits an expanding ripple with an attack-decay opacity envelope.
- **Spring pop entrance** — the canonical entrance: an element (or staggered group)
  springs `scale: 0 → 1` with `back.out` overshoot, authored `fromTo` so it's correct
  at t=0 under seek.
- **Motion blur streak** — fake directional velocity blur on a fast entrance or camera
  push-through: peaks at max speed, resolves to 0 at the settle (an SVG blur filter
  tweened via a proxy, or a deterministic ghost trail that collapses into the lead).
- **Particle burst** — deterministic particle/confetti events: a fixed pool,
  index-seeded launch values, one linear-eased driver whose `onUpdate` computes each
  particle as a pure ballistic function of time — scrub-safe mid-flight, keep the pool
  small (≤ ~40 particles).
- **Scale-swap morph** — a coordinated morph between two elements at the same screen
  center: the exit cluster shrinks and fades, the entrance pops in with `back.out(2)`
  overshoot.
- **Theme crossfade** — a whole-theme in-place morph under one fixed anchor: stacked
  complete layers cross-fade on opacity only while the anchor element never moves.

See `transition-techniques` for the scene-to-scene and text-beat handoff catalog, and
`cursor-lead` for the oversized-cursor recipes this list assumes as a companion.
