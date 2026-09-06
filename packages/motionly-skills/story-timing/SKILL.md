---
name: story-timing
description: Plan readable story beats, timing, and narration-aware pacing for Motionly.
---

# Story and timing

## Beat contract

Define each beat before coding:

| Field | Question |
| --- | --- |
| Spoken thought | What single sentence is heard or understood? |
| Visual claim | What proves or intensifies it? |
| Focal subject | What should the eye find first? |
| Primary action | What one motion carries the beat? |
| Ambient support | What subtle motion keeps it alive? |
| Exit destination | What element or silhouette must exist next? |

Split a beat if two focal subjects or claims compete. Remove visuals that answer none of these questions.

## Pace for comprehension

Allocate four phases: arrival, settle, readable hold, and departure. Use the final voice track when available. Otherwise estimate:

```text
speechSeconds = words / wordsPerSecond
beatSeconds = speechSeconds + emphasisPause + transitionOverlap
```

TTS `[break=...]` begins after a phrase is spoken; it is not the scene duration. Align the visual settle near the emphasized word, not merely at phrase start. Finalize against the recorded waveform or exact TTS output.

- Move short setup lines faster than consequences or proof.
- Hold symbols after they become recognizable.
- Give brand introductions more air than supporting claims.
- Keep product UI inspectable after the morph.
- Use tempo contrast; uniform beat lengths feel mechanical.
- Start the outgoing transition after the reading hold but while the ideas still connect.

## Retiming without breaking choreography

Build a single time map from source positions to target positions. Apply its scale factor to every explicit timeline position and duration, then scale scene starts and durations by the same factor. Derive narration cues and captions from that map so metadata and motion cannot drift apart.

Keep every operation on the provided timeline. Frame rate is sampling density: a 60 fps export contains more frames across the same seconds and must not run animation faster.

## Reusable story patterns

- Desire -> difficulty -> cost -> unreliable alternative -> product -> proof -> promise.
- Before -> failed attempt -> consequence -> new workflow -> visible result.
- Question -> escalating evidence -> reveal -> interaction -> concise CTA.

End with one resolved brand thought. Do not add an unrelated second slogan after the conclusion.
