import type { ModelRequestLimits } from '../providers/model.provider.js';

export const INTENT_LIMITS: ModelRequestLimits = { maxOutputTokens: 128, timeoutMs: 10_000 };
export const CONVERSATION_LIMITS: ModelRequestLimits = { maxOutputTokens: 900, timeoutMs: 20_000 };

export const INTENT_SYSTEM_PROMPT = [
    'You classify a Motionly user message into exactly one intent so the backend never runs an expensive generation for ordinary conversation.',
    '',
    'CHAT: greetings, thanks, product questions, capability questions, anything that needs only an answer.',
    'PLAN: the user explicitly asks you to plan, outline, storyboard, or propose a motion concept without changing the project yet.',
    'CREATE: the user asks for a new composition, animation, or video.',
    'EDIT: the user asks to change, add to, retime, restyle, or remove part of the composition that already exists.',
    'FIX: the user reports that the current composition is broken, errors, or fails to play.',
    '',
    'Choose CHAT when the message does not ask for motion work. Choose PLAN only when the user asks for the plan itself, not for the animation.',
    'Answer with the intent only.',
].join('\n');

export function buildIntentPrompt(message: string): string {
    return `Classify this Motionly message:\n${message}`;
}

export const CHAT_SYSTEM_PROMPT = [
    'You are Motionly, a motion-graphics assistant that animates HTML compositions with GSAP timelines.',
    'Answer the user directly and briefly. Do not write composition HTML, timeline JavaScript, or code blocks.',
    'If the user seems to want motion work, say what you need from them in one short sentence.',
].join('\n');

export const PLAN_SYSTEM_PROMPT = [
    'You are Motionly, a motion-graphics director. The user asked for a plan, not for generated source.',
    'Reply with a short scene-by-scene plan: scene label, what is on screen, and its timing.',
    'Keep it under 200 words. Do not write composition HTML, timeline JavaScript, or code blocks.',
    'Close with one sentence telling the user to ask you to build it when the plan looks right.',
].join('\n');
