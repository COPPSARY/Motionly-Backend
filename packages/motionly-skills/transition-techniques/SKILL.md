---
name: transition-techniques
description: A concrete technique catalog for scene-to-scene and in-scene transitions — velocity-matched cuts (zoom-through, inverse zoom-through, directional cut, waterfall cut, rack-focus blur-cut) plus two in-scene moves (waterfall entry, nudge curve). Covers partial-travel distances, mirrored eases, the Z scale-sign rule, and blur logic. Read before authoring any scene handoff, text-beat handoff, kinetic-text entry, or group reposition.
---

# Transition Techniques

One principle drives every seam technique here: **cut at peak velocity, match direction
and speed on both sides of the cut** — plus two in-scene techniques (arrivals, slides).
The continuity law this implements (vector law, the current, carriers) lives in
`motion-continuity`; read it first. This skill is the parameters and mechanics.

## Catalog

| # | Technique                | Scope                       | Axis                | Use for                                       |
| - | ------------------------- | ---------------------------- | -------------------- | ------------------------------------------------ |
| 1 | **Zoom-Through** (forward) | Within-scene text swap       | Z, toward viewer      | progressing deeper into the same thought          |
| 2 | **Inverse Zoom-Through**   | Arrival / payoff beat        | Z, away from viewer   | something bigger lands                            |
| 3 | **Directional Cut**        | Between scenes               | X / Y                 | the default boundary                              |
| 4 | **Waterfall Cut**          | Text-to-text handoff         | X, per-word           | word-level handoff between big-text beats         |
| 5 | **Rack-Focus Blur-Cut**    | Same-surface state swap      | X / Y / Z             | the one cut you want seen — a focus-pull flourish |
| 6 | **Waterfall Entry**        | In-scene arrival (no cut)    | Y, from below         | title cards, segment openers, list intros         |
| 7 | **Nudge Curve**            | In-scene group slide (no cut)| X / Y                 | repositioning a composed group to make room       |

## Z Direction Is a Sign

"Same axis" isn't enough on Z — the sign of d(scale)/dt must match across the cut:

| Z vector       | Exit scale          | Entry scale          | Variant              |
| -------------- | -------------------- | ---------------------- | ---------------------- |
| Push (forward) | growing `1 → 1.2`     | growing `0.75 → 1`      | zoom-through           |
| Pull (back)    | shrinking `1 → 0.8`   | shrinking `1.25 → 1`    | inverse zoom-through   |

Banned mirrors: a receding exit answered by a grow-from-small entry (the common one,
since grow-from-small is the default element entrance), and a push exit answered by an
oversized retraction. This also binds the incoming scene's own entrances during the cut
window (~0.5s after) — hold the incoming frame composed, or author its entrance to
match the sign.

## Blur Logic (all Z variants)

| Subject                                       | Peak blur   | Why                                                            |
| ------------------------------------------------ | ------------- | ----------------------------------------------------------------- |
| Text-scale (headline, word group)                 | **10px**      | 20px smears letterforms — the cut reads as a glitch, not speed    |
| Full-frame surface (window, card, screenshot)     | **18–20px**   | lighter blur on a big surface reads as a rendering hiccup         |

Same peak blur on both sides at the swap frame. Blur the element's wrapper, never its
children.

## 1. Zoom-Through (forward)

Z-axis velocity-matched swap; never both texts visible. Everything grows: the outgoing
text accelerates toward camera, a hard swap hides at peak blur, the incoming text keeps
growing into the focal plane. Headlines and short phrases only. Total ≈ 0.4s.

| Phase          | Scale    | Blur     | Opacity           | Ease                                        | Duration |
| -------------- | -------- | -------- | ------------------ | --------------------------------------------- | -------- |
| Exit           | 1 → 1.2  | 0 → 10px | 1 → 0.15            | `power3.in` (opacity: separate linear tween)  | 0.2s     |
| Swap (set)     | in: 0.75 | 10px     | out: 0 / in: 0.15   | —                                              | —        |
| Entry          | 0.75 → 1 | 10 → 0px | 0.15 → 1            | `expo.out`                                    | 0.5s     |

Exit opacity must be its own linear tween — `power3.in` holds opacity near 1 too long.
On entry, all properties share `expo.out`.

## 2. Inverse Zoom-Through (backward)

The pull-back mirror: the outgoing element recedes; the incoming arrives oversized (as
if just behind camera) and retracts into the focal plane. Everything shrinks. Spend it
on arrival/payoff beats — never ordinary boundaries. Total ≈ 0.7s (30% exit / 70%
entry).

| Phase          | Scale    | Blur     | Opacity           | Ease                                        | Duration |
| -------------- | -------- | -------- | ------------------ | --------------------------------------------- | -------- |
| Exit           | 1 → 0.8  | 0 → 10px | 1 → 0.15            | `power3.in` (opacity: separate linear tween)  | ~0.2s    |
| Swap (set)     | in: 1.25 | 10px     | out: 0 / in: 0.15   | —                                              | —        |
| Entry          | 1.25 → 1 | 10 → 0px | 0.15 → 1            | `expo.out`                                    | ~0.5s    |

**Sign discipline:** the incoming scene arrives as a composed frame inside the
retracting element — no grow-from-small intro in the cut window. Staged entrances
happen after the retraction settles, or start ≥1 and retract.

## 3. Directional Cut (default scene boundary)

X/Y velocity-matched cut — the default for scene-to-scene boundaries, in the
composition's chosen direction, not an accent. The outgoing hero accelerates in one
direction, the cut lands mid-motion, the incoming hero continues the same direction and
decelerates. Total ≈ 0.6s; directions left / right / up / down.

**Partial travel:** ~12% of frame (≈230px at 1920) — never full off-screen moves.

| Direction | Exit          | Entry start → end |
| --------- | ------------- | ------------------ |
| Leftward  | `x: 0 → −230` | `x: +230 → 0`       |
| Rightward | `x: 0 → +230` | `x: −230 → 0`       |
| Upward    | `y: 0 → −230` | `y: +230 → 0`       |
| Downward  | `y: 0 → +230` | `y: −230 → 0`       |

Mechanics:

- **Mirrored eases:** exit `power4.in` + entry `power4.out`, same distance and
  duration — the two halves of one `power4.inOut`, so velocity matches exactly at the
  cut.
- **The fade trick:** exit opacity completes at ~25–30% of its travel (fade ≈
  0.18–0.3s vs motion 0.3–0.34s); entry ignites at ~0.35 opacity mid-path. Time the last
  fading element to die right at the cut — a gap where nothing moves reads as dead air.
- Exit 0.2–0.4s; entry ≥ exit. Optional blur 8–10px.
- **Stage ground:** the composition's background must stay opaque through the cut — see
  `scene-seams` for why a translucent stage flashes white mid-cut.

## 4. Waterfall Cut (word-by-word directional cut)

A directional cut at word granularity — the strongest handoff for text-to-text seams.
Outgoing words ramp out on their own curves; incoming words cascade in mid-flight — a
wave the eye rides across the seam.

| Parameter           | Value                 | Why                                          |
| --------------------- | ----------------------- | ----------------------------------------------- |
| Travel               | ±230px (~12% frame)     | partial travel + velocity beats full-frame push |
| Exit                 | 0.34s `power4.in`       | the acceleration is the cut                    |
| Exit fade            | 0.18s, starts with x    | word gone by ~25–30% of travel — no smear      |
| Exit stagger         | +0.022s reading order   | the line peels, not a block slide              |
| Entry                | 0.3s `power4.out`       | back half of the composite — velocity match    |
| Entry start opacity  | 0.35                    | mid-path ignition; binary 0→1 pops             |
| Entry gaps           | 0.05s × 0.84 decay      | accelerating cascade, resolves composed        |

Rules:

- One direction per chain, riding the current. Inverse zoom is only the chain's arrival
  beat.
- Pre-set all words to `x: +230, opacity: 0` at build time.
- A short first beat may exit whole-line: its fade ends ~0.02s before the cut so it is
  still streaking when the next words ignite.
- Transform/opacity only.

## 5. Rack-Focus Blur-Cut (the visible cut)

The one variant where the cut is *seen*: a defocus blur spike hides a single-frame hard
swap — a focus-pull flourish. Use for an occasional state swap of the same surface;
never the default boundary.

Differs from the others: outgoing stays fully opaque until the cut (the blur hides the
swap — no early fade); eases `power2.in` / `power2.out` (soft optics, not momentum).

Rules:

- Fire only at a real beat, at most once per ~8s; never mid-caption or during a hold.
- Cut at peak blur (≥6px; peak 8–12px, ≤16–18px max) — swapping on the way up shows the
  cut.
- A subtle scale (~1.06, lens-breathing) sells it as optics.
- Same direction on both sides — the vector law still holds. Entry ≥ exit duration.
- Blur the wrapper, never blur + opacity in one tween on one element.

## 6. Waterfall Entry (in-scene arrival — not a cut)

Staggered arrival cascade: words/elements whip in from below, each starting before the
previous settles — an accelerating wave that resolves into a composed layout. Title
cards, segment openers, list/feature intros. Do not mix its rules with §4:

|               | §6 Entry (arrival)                             | §4 Waterfall Cut (seam)                                    |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Opacity         | binary 0→1 at entry — never fade                    | ignites at 0.35 mid-path — the fade is the velocity trick      |
| Axis default    | Y, from below                                       | X, riding the current                                          |
| Outgoing side   | none                                                | words ramp out on mirrored `power4.in`                          |

Choreography:

- Overlap, don't queue — the next element starts within ±2 frames of the previous
  settling; gaps shrink across the cascade; the last element snaps.
- Velocity varies by weight — heavy/anchor elements travel further and longer; light
  words/punctuation snap in tight:

| Parameter | Anchor/heavy | Normal word | Light/punctuation |
| --------- | ------------ | ------------ | -------------------- |
| Y offset  | 60–80px      | 40–50px      | 30–48px              |
| Duration  | 0.16–0.20s   | 0.13–0.16s   | 0.10–0.13s           |
| Overlap   | 0–2f gap     | 1f overlap   | 1–2f overlap         |

- Ease `power4.out` (`expo.out` for extra snap); never `.inOut` on an entry.
- One direction per cascade.
- Split the final word into fragments to extend the climax; fragments travel further.

## 7. Nudge Curve (in-scene group slide — not a cut)

Slow-fast-slow repositioning of a composed group (word rows, card stacks, lists) to
reveal content or make room. No single built-in ease produces it — `power4.inOut`
smacks to a stop. Chain three tweens on one property:

| Phase     | Ease            | Distance | Time | Feel                                      |
| --------- | --------------- | -------- | ---- | -------------------------------------------- |
| 1 ramp-in | `power3.in`     | ~10%     | ~20% | barely moves — motion registers, no jolt    |
| 2 burst   | `none` (linear) | ~65%     | ~18% | ~2× average px/frame — purposeful           |
| 3 tail    | `power4.out`    | ~25%     | ~62% | decaying creep to rest — kills the smack    |

Rules:

- The tail is ≥3× the ramp-in in time. If it still smacks: extend the tail's time (not
  distance), or use `power5.out`.
- Phase 2 stays linear — easing it loses the burst contrast.
- Reveal new content during phase 2 — the burst masks its appearance.
- Same ratios vertical; scale distances proportionally, keep the time ratios.

## Anti-Patterns

| Don't                                                                       | Instead                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Two texts visible during a zoom-through                                       | Hard swap at blur peak, one text at a time                                  |
| 20px blur on text-scale subjects                                              | 10px text; 18–20px only full-frame                                          |
| Inverse-zoom exit answered by a grow-from-small entry                          | Match the scale-velocity sign                                               |
| Gentle entry easing (`power2.out`) after a fast exit                           | Mirror the exit: `power4.out` / `expo.out`                                  |
| Full off-screen exits/entries                                                  | Partial travel (~12%) + early fade                                          |
| `.inOut` eases on either side of a cut                                        | Mirrored `power4.in` / `power4.out`                                         |
| Equal gaps across a waterfall cascade                                          | Shrink gaps ×0.84 per word                                                  |
| Zoom-through on body text                                                     | Headlines and short phrases only                                            |
| Consecutive boundaries in opposing directions                                 | One current; reserved vectors spent on meaning                              |
| Queued entries (each waits for the previous to settle)                        | Overlap ±1–2 frames — the cascade is a wave, not a queue                    |
| Gradual opacity fade on a §6 arrival                                          | Binary 0→1 — fading fights the snap                                        |
| Single ease for a group slide (`power4.inOut`)                                | The §7 three-phase chain                                                    |
| Nudge tail shorter than 3× the ramp-in                                        | Extend the tail's time, not its distance                                    |
