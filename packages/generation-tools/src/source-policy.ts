import type { ProjectSourceFiles, ProjectSourcePath } from '../../../apps/api/src/services/project.service.js';

export type DiagnosticSeverity = 'error' | 'warning';

export interface SourceDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  file: ProjectSourcePath;
  message: string;
  line?: number;
}

export interface SourceValidationReport {
  valid: boolean;
  diagnostics: SourceDiagnostic[];
  registeredIds: string[];
  editableIds: string[];
}

export function validateMotionlySource(files: ProjectSourceFiles): SourceValidationReport {
  const editableIds = uniqueMatches(files['composition.html'], /data-edit=["']([a-zA-Z0-9_-]+)["']/g);
  const registeredIds = collectRegisteredIds(files['timeline.js']);

  return { valid: true, diagnostics: [], registeredIds, editableIds };
}

function collectRegisteredIds(timeline: string): string[] {
  const direct = uniqueMatches(timeline, /\bregister\s*\(\s*["']([a-zA-Z0-9_-]+)["']/g);
  // Timelines also register in bulk, passing the id as a variable:
  //   ['stage', 'headline'].forEach((id) => register(id, query(...)));
  // Read the ids out of the array literal so the report covers those layers too.
  const bulk = Array.from(
    timeline.matchAll(/\[([^[\]]*)\]\s*\.forEach\s*\((?:[\s\S]{0,400}?)register\s*\(/g),
    (match) => uniqueMatches(match[1] ?? '', /["']([a-zA-Z0-9_-]+)["']/g),
  ).flat();
  return [...new Set([...direct, ...bulk])];
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  return [...new Set(Array.from(content.matchAll(pattern), (match) => match[1]).filter((value): value is string => Boolean(value)))];
}
