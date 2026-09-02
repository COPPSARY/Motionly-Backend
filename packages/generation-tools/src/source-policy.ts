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
  const diagnostics: SourceDiagnostic[] = [];
  const forbidden = [
    { pattern: /\b(?:from|import)\s*['"](?:node:|fs|child_process|net|http|https|process)/, message: 'Node built-in imports are not allowed.' },
    { pattern: /\b(?:require|import)\s*\(\s*['"](?:node:|fs|child_process|net|http|https|process)/, message: 'System imports are not allowed.' },
    { pattern: /\b(?:process|Buffer|global)\s*\./, message: 'System APIs are not allowed.' },
    { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/, message: 'Network APIs are not allowed.' },
    { pattern: /<(?:script|link|img|video|audio|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']https?:/i, message: 'Remote URLs are not allowed.' },
    { pattern: /\bimport\s*\(\s*["']https?:/, message: 'Remote imports are not allowed.' },
  ];
  for (const [file, content] of Object.entries(files) as Array<[ProjectSourcePath, string]>) {
    for (const rule of forbidden) {
      if (rule.pattern.test(content)) diagnostics.push({ code: 'FORBIDDEN_SOURCE_API', severity: 'error', file, message: rule.message });
    }
  }

  return { valid: diagnostics.length === 0, diagnostics, registeredIds, editableIds };
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  return [...new Set(Array.from(content.matchAll(pattern), (match) => match[1]).filter((value): value is string => Boolean(value)))];
}
