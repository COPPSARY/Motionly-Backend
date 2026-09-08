---
name: motion-continuity
description: The high-level motion law for multi-scene compositions — makes a sequence of scenes feel like one continuous camera move instead of independently-animated slides. Covers the vector law, the film's current, carrier elements, causal motion, the ban on idle wobble, and stillness before climax.
---

# Motion Continuity

Read this before choreographing a multi-scene composition. It decides what happens at
every scene handoff and how a scene performs between its entry and exit. The failure
this prevents: scenes authored in isolation — the eye's momentum dies at every cut, and
scenes wobble in place instead of doing something.

## The Vector Law

How scene A exits determines how scene B enters: same axis, same direction, matched
speed, cut mid-motion on both sides.

1. **Axis** — x stays x, y stays y, z stays z. Never trade axes across a handoff.
2. **Direction** — never mirror. On z (scale), direction = the sign of scale change:
   growing = push (camera forward), shrinking = pull (camera back). A receding exit
   answered by a grow-from-small entry is a mirrored vector — the most common
   violation, since grow-from-small is the default element entrance.
3. **Speed** — entry initial velocity ≈ exit final velocity, via mirrored eases (exit
   `power4.in` + entry `power4.out`, same distance and duration; the incoming side
   picks up ≥50% through the notional path). Mechanics in `transition-techniques`.
4. **Phase** — the cut lands mid-motion on both sides. Settling to rest before the cut,
   or starting from rest after it, is a dead beat.

## The Current

Pick one dominant direction for the whole composition (a common default is left).
Every ordinary handoff uses it. Other vectors are reserved — spending one means
something:

| Vector                    | Meaning                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| The current                | "next beat" — neutral forward progress                            |
| Upward                     | elevation — a conclusion or reveal rises above what came before   |
| Z forward (zoom-through)   | pushing deeper into the same thought                              |
| Z backward (inverse zoom)  | arrival — something bigger lands                                  |
| Scale-burst (explode out)  | leaving a world — a surface blasts past camera                    |

- Never run consecutive handoffs in opposing directions — ping-pong reads as an error.
- A direction change needs a visible cause (click, bounce, impact) or a real topic
  change; don't spend a reserved vector for variety.

## Carriers

The eye follows objects, not abstractions. The strongest handoffs carry a concrete
element across the cut at matched position and velocity: a cursor mid-path, a container
that shrinks/docks into the next layout, a mark that flies into its exact slot, a word
group riding a waterfall cut. With no natural carrier, let the scene's hero element
carry it (partial travel + early fade, entry mid-flight). A plain crossfade has no
carrier at all — avoid it as the default.

## Causal Motion

Chain motion so each move is visibly launched by the last: click → squash → release
spring → flight → impact → recoil → reveal.

- Effects start on the causing frame — same timeline position, never "shortly after."
- Reactions scale with implied mass: big elements rebound slower, small ones snap.
- A force is a license to change direction; an uncaused flip reads as a glitch.

## No Idle Wobble

Idle sine loops (breathe, float, drift, glow pulse) are banned as *sustained* motion —
they read as "the video is waiting." A scene that finishes entering with seconds left is
a planning bug: add content, not wobble. Every phase between entry and exit should be
owned by one of these routes:

| Route                  | What it is                                                                       |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Staged reveals**      | Hold content back; pay it off in beats — the frame keeps gaining information      |
| **Camera with intent**  | A mapped scale+pan path: establish wide → travel → arrive on the subject          |
| **Sequenced UI life**   | The product behaves over time: progress advances, highlights step, counts tick    |
| **Animated sequences**  | Elements act out a beat: a card files into a stack, an item assembles             |
| **Cursor-led action**   | An oversized cursor walks the eye to a trigger; its click ignites the next beat (`cursor-lead`) |

Test: pause the timeline at any second — something meaningful must be mid-flight (a
reveal landing, the camera traveling, the UI doing what the moment calls for).

## Stillness Before Climax

Schedule a 0.3–0.75s pause between a major action and its result — the dramatic comma.
A scene that jumps straight from action to result loses the beat.

## Timing Intents

- Single entry ≤ ~800ms; longer buildup = multi-element stagger, not one slow element.
- Total stagger ≤ 500ms; with 8+ elements, tighten per-item delay or stagger only the
  first few.
- Forbidden eases for entrances: `bounce.out` / `elastic.out`. Entry overshoot
  `back.out(1.4–1.7)` is fine.
- Similar elements share one ease+duration intent — never a unique pair per element.
- Use only 2–3 scene-to-scene transition types across the whole composition and repeat
  them; a hand-authored shared-element morph doesn't count against that budget.

## Anti-Patterns

| Don't                                                                        | Instead                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Author each scene's entrance in isolation                                     | Plan the exit/entry vectors for the whole sequence first |
| Crossfade between scenes                                                      | A velocity-matched handoff in the current's direction  |
| Exit completes, then the scene changes                                        | Cut mid-motion on both sides                           |
| Entry starts from rest after a cut                                            | Enter ≥50% through the notional path                   |
| Inverse-zoom exit answered by a grow-from-small entry                         | Match the scale-velocity sign                          |
| Idle wobble / breathe / float to fill time                                    | Assign a sustained-motion route, or add content        |
| Direction flip without a cause                                                | Spend a force, or keep the current                     |
| Reaction a few frames after its cause                                         | Same-frame ignition                                    |
| Action jumps straight to result                                               | Schedule stillness-before-climax (0.3–0.75s)           |
