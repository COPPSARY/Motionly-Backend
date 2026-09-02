# Motionly GSAP helper catalogue

Generated `timeline.js` may import reviewed helpers from `@motionly/presets`: `reveal`, `slide`, `scalePop`, `blurReveal`, `maskWipe`, `staggerEntrance`, `staggerExit`, `cameraPush`, `cameraPull`, `sceneHandoff`, `morph`, `splitText`, and `textReveal`.

Every helper accepts the caller-owned timeline as its first argument. Most accept `{ at, duration, ease }`; slide/stagger/handoff helpers also accept direction and distance. Prefer these helpers for reliable entrances, handoffs, camera focus, and text splitting, then add composition-specific GSAP directly to the same timeline. Never create an independent playback controller.

Use `@motionly/presets` only in `timeline.js`. Register the semantic parent layer before splitting its text, and keep scene/track metadata aligned with the actual helper positions and durations.
