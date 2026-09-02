# Small Motionly edits

Use this skill for narrow requests such as changing text, color, font size, spacing, visibility, adding one short text layer, or changing a single timing value in an existing project.

- Treat the existing source as the design to preserve. Do not redesign scenes or invent copy.
- Inspect `composition.html` and `styles.css` first; inspect `timeline.js` only when the requested property is animated.
- Return only the changed file contents through `return_changed_files`. Do not replace an entire file for a one-property change unless the changed file content is required by the API response.
- Preserve every existing `data-edit` ID, `register(...)` call, scene, track, timeline relationship, and unaffected style.
- For a color request, update the existing selector or inline style for the requested layer. Do not add a new layer unless the prompt explicitly asks for one.
- For a request to add one short text layer, add one semantic element with a stable `data-edit` ID in the existing template, register that same ID in `timeline.js`, and animate it with the caller-owned timeline. Keep the existing scenes and copy unchanged.
- Confirm the requested change is present and unrelated source is unchanged before returning the changed files.
