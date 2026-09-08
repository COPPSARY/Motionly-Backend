---
name: cursor-lead
description: An oversized on-screen cursor as a visible protagonist that carries the eye and ignites the next beat with a click. Use whenever a scene involves a cursor or pointer-led action, when kicking off a UI scene, when igniting a morph/transition/typing run with a click, or when a scene reads as static and needs a cheap high-yield source of motion.
---

# Cursor Lead

A deliberately oversized pointer that travels the frame as a visible protagonist: it
enters from off-screen, walks the viewer's eye to the next point of interest, clicks to
cause the next thing that happens, and leaves.

**Why it works.** Big cursor movement is one of the cheapest high-yield motion sources
in a UI-driven scene: one element, transform-only tweens, and it (1) brings the eye
across the screen on beats that would otherwise read as dead, (2) gives causal ignition
to morphs/transitions ("the click did that"), and (3) segments the eye out of a stale
state when kicking off a new beat. Bigger is better — an actual-size cursor disappears
at video scale.

## Size & Look

- Full-frame scenes: about 7% of the frame width. In a smaller inset/mock: 4.5–5.5%.
  Never smaller.
- One arrow SVG everywhere. Two safe fills: white body + black stroke, or dark body +
  white stroke. Pick per-scene contrast, keep it constant for the whole composition.
- `filter: drop-shadow(...)`, `pointer-events: none`, stacked above all other content,
  `will-change: transform`.

```html
<div class="cursor" data-edit="cursor">…arrow svg…</div>
```

```css
.cursor {
  position: absolute;
  left: 48%;
  top: 115%; /* resting pose is off-screen below */
  width: 7cqw;
  height: 7cqw;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
  pointer-events: none;
  will-change: transform;
}
```

## Entry Law — Physical, Never Revealed

The cursor always enters from off-screen (default: from below) and travels to its first
target in one decelerating glide. It must feel like it entered the room. Never
opacity-fade it in at a resting position, never mask-reveal it — that reads as a
glitch.

- Default path: straight up the axis to the target — no fragmented diagonals unless the
  diagonal *is* the story.
- Duration 0.4–0.9s, ease `power3.out`.

```js
timeline.fromTo(
  cursor,
  { left: '48.6%', top: '115%' },
  { left: '48.6%', top: '55%', duration: 0.85, ease: 'power3.out' },
  0.25,
);
```

## Tip-Targeting & the Click Tap

The hot-spot is the arrow tip, not the box center. Land the tip on the target's center,
and pivot all press scaling on the tip (`transformOrigin` near the tip of the arrow
path).

Click = asymmetric compress/expand (roughly a 1:2 duration ratio reads as a real tap):

```js
timeline.to(cursor, { scale: 0.84, duration: 0.1, ease: 'power2.in' }, t);
timeline.to(cursor, { scale: 1, duration: 0.22, ease: 'power2.out' }, t + 0.1);
```

The target's reaction is a separate, parallel tween (e.g. a button: `scale: 0.94` plus a
press color/shadow change, starting at the same time). A cursor-only tap that just
focuses something gets no target reaction.

## The Click Ignites the Next Beat

Never let a morph, typing run, or scene-defining animation simply start on its own.
Park the cursor on the trigger and let the click cause it, same-frame:

- click → menu/submenu cascade, toggle flip
- click → typing kickoff into an input
- click → composer morph-down / panel resize
- click → logo ignition
- click → play-state flip / UI-life wake in a product mock

During long beats the cursor doesn't own (typing, a hold), it drifts aside (0.5–0.9s,
`power2.out`) — never sits frozen on top of the action, never wobbles idly.

## Exit Law

Two sanctioned exits — both physical, never an opacity fade in place:

1. **Leave the frame**: accelerate off the nearest edge with `power2.in`, 0.5–0.7s.
2. **Handoff into the next scene**: in the final ~0.3s before a scene handoff, the
   cursor starts accelerating toward the next scene's first click point, covering the
   first ~1/3 of that path; the next scene's cursor tween picks up at the handoff pose
   and continues with `power2.out` at matched velocity — the cursor itself becomes the
   carrier element that stitches the seam (see `motion-continuity`).

## Checklist

- [ ] Sized at least ~7% of frame width (4.5–5.5% inside a smaller mock)
- [ ] Enters from off-screen on one continuous vector — no fade or mask reveal
- [ ] Tip lands on the target's center; press pivots on the tip
- [ ] Every click causes something, same-frame
- [ ] Drifts aside during beats it doesn't own; zero idle wobble
- [ ] Exits physically (off-frame or a matched-velocity handoff) — no fade-in-place
