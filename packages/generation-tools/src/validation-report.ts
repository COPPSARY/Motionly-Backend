export function projectSettingsFromValidation(report: Record<string, unknown>) {
  const validation = objectValue(report.runtime);
  const runtime = objectValue(validation.runtime);
  const definition = objectValue(runtime.definition);
  const width = numberValue(definition.width, 'width');
  const height = numberValue(definition.height, 'height');
  const fps = numberValue(definition.fps, 'fps');
  const duration = numberValue(definition.duration, 'duration');
  return { width, height, fps, duration };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Generation validation report is missing runtime metadata.');
  return value as Record<string, unknown>;
}

function numberValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Generation validation report has invalid ${field}.`);
  return value;
}
