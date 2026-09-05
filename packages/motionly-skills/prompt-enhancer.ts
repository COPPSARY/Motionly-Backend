export function enhanceMotionlyPrompt(prompt: string, intent: 'CREATE' | 'EDIT'): string {
  const request = prompt.trim();
  const brief = intent === 'CREATE'
    ? [
      'Create a polished SaaS product film from this request.',
      'Treat any user-provided wording as exact copy unless the user asks for new copy.',
      'Build 3-6 connected beats: a sharp hook, recognizable friction, product turn, proof or interaction, and a concise resolution.',
      'Make each beat one complete sentence or short editorial thought. Use giant-to-readable zoom or slide entrances, restrained bounce/settle, a real reading hold, and overlapping handoffs.',
      'Use a coherent CSS design system with strong type hierarchy, intentional placement, safe bounds, a quiet structured background, and one semantic accent.',
      'Use a persistent visual carrier for at least one shape morph or match-cut. Animate with explicit GSAP timeline positions and deterministic initial states.',
      'Use supplied user assets when available. Replace reference branding, copy, colors, and timings with this request.',
    ]
    : [
      'Make this focused edit while preserving the existing visual language and unaffected source.',
      'Keep the current scenes, editable IDs, typography hierarchy, pacing, and transitions unless the request explicitly changes them.',
      'If the request changes a visual beat, keep it as one readable sentence with intentional placement and a clear arrival, hold, and departure.',
    ];
  return [
    `Original user request:\n${request}`,
    '',
    'Motionly production brief:',
    ...brief.map((line) => `- ${line}`),
  ].join('\n');
}
