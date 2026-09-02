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

const forbiddenPatterns: Array<{ code: string; pattern: RegExp; message: string }> = [
  { code: 'MOTION_FILE_FORBIDDEN', pattern: /\.motion\b/i, message: 'The .motion format is forbidden.' },
  { code: 'REMOTE_SOURCE_FORBIDDEN', pattern: /(?:https?:\/\/|\b(?:src|href|action|poster)\s*=\s*["']\s*\/\/|url\(\s*["']?\s*\/\/|["'`](?:https?:)?\/\/)/i, message: 'Remote sources are forbidden.' },
  { code: 'NETWORK_API_FORBIDDEN', pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, message: 'Runtime network APIs are forbidden.' },
  { code: 'BROWSER_DATA_ACCESS_FORBIDDEN', pattern: /\b(?:document\.cookie|document\.domain|localStorage|sessionStorage|indexedDB|caches\s*\.|navigator\.(?:credentials|serviceWorker))\b/, message: 'Browser credentials, storage, and persistent caches are forbidden.' },
  { code: 'BROWSER_ESCAPE_API_FORBIDDEN', pattern: /\b(?:navigator\.sendBeacon|postMessage|window\.(?:open|parent|top|opener)|(?:window\.|document\.)?location\s*(?:\.|=)|new\s+(?:Image|Worker|SharedWorker)\b)/, message: 'Browser navigation, messaging, and alternate network primitives are forbidden.' },
  { code: 'ACTIVE_HTML_FORBIDDEN', pattern: /<\s*(?:script|iframe|object|embed|foreignObject|form|link|meta)\b|\bon[a-z]+\s*=/i, message: 'Active or navigational HTML is forbidden in compositions.' },
  { code: 'ACTIVE_CSS_FORBIDDEN', pattern: /@import\b|(?:javascript:|data:text\/html|expression\s*\(|-moz-binding\s*:|behavior\s*:)/i, message: 'Active or importing CSS is forbidden in compositions.' },
  { code: 'NODE_API_FORBIDDEN', pattern: /(?:node:)?(?:child_process|fs\/promises|process\.env)/, message: 'Node host APIs are forbidden in composition source.' },
  { code: 'DYNAMIC_CODE_FORBIDDEN', pattern: /\b(?:eval|Function)\s*\(/, message: 'Dynamic code execution is forbidden.' },
  { code: 'DYNAMIC_IMPORT_FORBIDDEN', pattern: /\bimport\s*\(/, message: 'Dynamic imports are forbidden.' },
  { code: 'JSON_ANIMATION_DSL_FORBIDDEN', pattern: /(?:animationDocument|animationDsl|jsonTimeline|renderFromJson)/i, message: 'A JSON animation representation is forbidden.' },
];

export function validateMotionlySource(files: ProjectSourceFiles): SourceValidationReport {
  const diagnostics: SourceDiagnostic[] = [];
  for (const [file, content] of Object.entries(files) as Array<[ProjectSourcePath, string]>) {
    for (const forbidden of forbiddenPatterns) {
      const match = forbidden.pattern.exec(content);
      if (match) diagnostics.push({
        code: forbidden.code,
        severity: 'error',
        file,
        message: forbidden.message,
        line: lineNumber(content, match.index),
      });
    }
    if (file === 'index.ts' || file === 'timeline.js') validateImports(diagnostics, file, content);
  }

  requirePattern(diagnostics, files['composition.html'], 'composition.html', /<template\b/i, 'HTML_TEMPLATE_REQUIRED', 'composition.html must contain a template.');
  requirePattern(diagnostics, files['composition.html'], 'composition.html', /<(?:main|section|article|svg)\b/i, 'SEMANTIC_ROOT_REQUIRED', 'composition.html must contain semantic HTML or SVG.');
  requirePattern(diagnostics, files['timeline.js'], 'timeline.js', /export\s+function\s+\w*Timeline\s*\(/, 'TIMELINE_BUILDER_REQUIRED', 'timeline.js must export a timeline builder.');
  requirePattern(diagnostics, files['timeline.js'], 'timeline.js', /\btimeline\s*\.(?:set|to|from|fromTo|add|call)\s*\(/, 'CALLER_TIMELINE_REQUIRED', 'timeline.js must write to the caller-owned timeline.');
  requirePattern(diagnostics, files['index.ts'], 'index.ts', /defineComposition\s*\(/, 'COMPOSITION_DEFINITION_REQUIRED', 'index.ts must define the composition.');
  requirePattern(diagnostics, files['index.ts'], 'index.ts', /composition\.html\?raw/, 'HTML_IMPORT_REQUIRED', 'index.ts must import composition.html as authored source.');
  requirePattern(diagnostics, files['index.ts'], 'index.ts', /(?:build\w*Timeline|buildTimeline)\s*\(/, 'TIMELINE_INVOCATION_REQUIRED', 'index.ts must invoke the timeline builder.');

  const thinAdapterFailures = [
    { pattern: /document\.createElement\s*\(/, message: 'index.ts must not generate the composition DOM.' },
    { pattern: /\bgsap\s*\./, message: 'index.ts must not author animation.' },
    { pattern: /\.innerHTML\s*=/, message: 'index.ts must mount imported authored HTML, not generate it.' },
  ];
  for (const failure of thinAdapterFailures) {
    const match = failure.pattern.exec(files['index.ts']);
    if (match) diagnostics.push({ code: 'THIN_ADAPTER_VIOLATION', severity: 'error', file: 'index.ts', message: failure.message, line: lineNumber(files['index.ts'], match.index) });
  }

  const editableIds = uniqueMatches(files['composition.html'], /data-edit=["']([a-zA-Z0-9_-]+)["']/g);
  const registeredIds = uniqueMatches(files['timeline.js'], /\bregister\s*\(\s*["']([a-zA-Z0-9_-]+)["']/g);
  const hasDynamicRegistration = /\bregister\s*\(\s*(?!["'])/.test(files['timeline.js']);
  if (!editableIds.length) diagnostics.push({ code: 'EDITABLE_LAYER_REQUIRED', severity: 'error', file: 'composition.html', message: 'At least one stable data-edit layer is required.' });
  if (!registeredIds.length && !hasDynamicRegistration) diagnostics.push({ code: 'REGISTERED_LAYER_REQUIRED', severity: 'error', file: 'timeline.js', message: 'At least one editable layer must be registered.' });
  for (const id of registeredIds) {
    if (!editableIds.includes(id)) diagnostics.push({ code: 'REGISTERED_LAYER_MISSING', severity: 'error', file: 'timeline.js', message: `Registered layer does not exist in composition.html: ${id}` });
  }

  const duration = /duration\s*:\s*(\d+(?:\.\d+)?)/.exec(files['index.ts']);
  if (!duration || Number(duration[1]) <= 0) diagnostics.push({ code: 'DURATION_REQUIRED', severity: 'error', file: 'index.ts', message: 'Composition duration must be a positive literal.' });
  const scenes = /scenes\s*:/.test(files['index.ts']);
  if (!scenes) diagnostics.push({ code: 'SCENE_METADATA_REQUIRED', severity: 'error', file: 'index.ts', message: 'Composition scene metadata is required.' });

  return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'), diagnostics, registeredIds, editableIds };
}

function validateImports(diagnostics: SourceDiagnostic[], file: 'index.ts' | 'timeline.js', content: string) {
  const imports = Array.from(content.matchAll(/\b(?:import|export)\s+(?:[^'"\n]*?\s+from\s*)?["']([^"']+)["']/g), (match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));
  for (const specifier of imports) {
    const allowed = file === 'timeline.js'
      ? specifier === 'gsap' || specifier === '@motionly/presets'
      : specifier === '@motionly/runtime'
        || ['./composition.html?raw', './styles.css?raw', './styles.css', './timeline.js'].includes(specifier)
        || /^\.\/assets\/[a-f0-9-]{36}\.(?:png|jpe?g|webp|svg|gif|mp4|webm|mov|mp3|wav|ogg|woff2?)(?:\?url)?$/i.test(specifier);
    if (!allowed) diagnostics.push({
      code: 'SOURCE_IMPORT_FORBIDDEN', severity: 'error', file,
      message: `Source import is not approved: ${specifier}`,
      line: lineNumber(content, content.indexOf(specifier)),
    });
  }
}

function requirePattern(
  diagnostics: SourceDiagnostic[],
  content: string,
  file: ProjectSourcePath,
  pattern: RegExp,
  code: string,
  message: string,
) {
  if (!pattern.test(content)) diagnostics.push({ code, severity: 'error', file, message });
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  return [...new Set(Array.from(content.matchAll(pattern), (match) => match[1]).filter((value): value is string => Boolean(value)))];
}

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
