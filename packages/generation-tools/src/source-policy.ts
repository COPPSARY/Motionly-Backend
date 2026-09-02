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
  const registeredIds = uniqueMatches(files['timeline.js'], /\bregister\s*\(\s*["']([a-zA-Z0-9_-]+)["']/g);

  return { valid: true, diagnostics: [], registeredIds, editableIds };
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  return [...new Set(Array.from(content.matchAll(pattern), (match) => match[1]).filter((value): value is string => Boolean(value)))];
}
