import type { RoutedSkill } from '../../motionly-skills/router.js';
import type { GenerationIntent, MotionlyProject } from '../graph/dependencies.js';
import type { ChatMessage, ModelRequestLimits } from '../providers/model.provider.js';

export const GENERATION_LIMITS: ModelRequestLimits = { maxOutputTokens: 16_000, timeoutMs: 120_000 };

const FENCE = '```';

const OUTPUT_RULES = [
    'You are Motionly, a cloud motion-graphics engineer. The frontend renders your output with GSAP; you never render, preview, or export anything yourself.',
    '',
    'Produce exactly these fields: title, duration, width, height, fps, scenes, compositionHtml, timelineJs, reply.',
    'Never produce package.json, index.ts, React or Svelte components, separate CSS files, npm dependencies, remote scripts, or backend code.',
    '',
    'compositionHtml rules:',
    '- Exactly one top-level <template> element that contains the whole composition.',
    '- All CSS lives in a <style> element inside that template. Scope selectors to the composition.',
    '- Give every element you animate or edit a unique, stable data-edit attribute.',
    '- No <script> elements, no remote fonts, images, or stylesheets.',
    '',
    'timelineJs rules:',
    '- One ES module that exports exactly `export function buildTimeline({ root, timeline, register })`.',
    '- Query every target under `root`; only call register with an element that was found. Use a query helper that throws when a required element is missing.',
    '- Drive every animation through the provided `timeline`. Never construct your own GSAP timeline and never call gsap directly on the document.',
    '- No import statements, no dynamic import, no fetch, XMLHttpRequest, WebSocket, EventSource, cookies, localStorage, sessionStorage, or window.open.',
    '',
    'Keep duration, width, height, fps, and the scene list consistent with the composition you build.',
    'Each scene needs id, label, start, duration, and accent, and scene timings must stay inside duration.',
    'reply is one or two plain sentences telling the user what you changed.',
].join('\n');

export function buildMotionSystemPrompt(skills: RoutedSkill[]): string {
    if (skills.length === 0) return OUTPUT_RULES;
    const guidance = skills
        .map((skill) => `--- skill: ${skill.id} (${skill.reason}) ---\n${skill.content}`)
        .join('\n\n');
    return `${OUTPUT_RULES}\n\nMotionly skills selected for this request:\n\n${guidance}`;
}

const INTENT_INSTRUCTIONS: Record<GenerationIntent, string> = {
    CREATE: 'Build the composition the user asked for. You may replace the current source completely.',
    EDIT: 'Return the complete updated project. Change only what the user asked for and keep every other element, style, timing, and data-edit identifier intact.',
    FIX: 'Return the complete repaired project. Make the smallest change that removes the reported failure and keep the existing design intact.',
};

export interface MotionPromptInput {
    intent: GenerationIntent;
    message: string;
    project?: MotionlyProject | undefined;
    recentMessages: ChatMessage[];
    runtimeError?: { message: string } | undefined;
}

export function buildMotionUserPrompt(input: MotionPromptInput): string {
    const sections = [
        `Task: ${INTENT_INSTRUCTIONS[input.intent]}`,
        `User request:\n${input.message}`,
    ];

    if (input.runtimeError) {
        sections.push(`Renderer error reported for the current project:\n${input.runtimeError.message}`);
    }
    if (input.recentMessages.length > 0) {
        sections.push(`Recent conversation:\n${formatHistory(input.recentMessages)}`);
    }

    sections.push(input.project ? describeProject(input.project) : NO_PROJECT_YET);
    return sections.join('\n\n');
}

export const NO_PROJECT_YET = [
    'There is no project yet; this generation creates one.',
    'Choose a canvas that suits the request and default to 1920x1080 at 60fps when the user gives no preference.',
].join('\n');

export function describeProject(project: MotionlyProject): string {
    return [
        'Current project:',
        `title: ${project.title}`,
        `canvas: ${project.width}x${project.height} at ${project.fps}fps`,
        `duration: ${project.duration}s`,
        `revision: ${project.revision}`,
        `scenes: ${JSON.stringify(project.scenes)}`,
        '',
        'Current compositionHtml:',
        `${FENCE}html\n${project.compositionHtml}\n${FENCE}`,
        '',
        'Current timelineJs:',
        `${FENCE}js\n${project.timelineJs}\n${FENCE}`,
    ].join('\n');
}

function formatHistory(messages: ChatMessage[]): string {
    return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
}
