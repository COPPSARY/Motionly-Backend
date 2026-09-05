import { Annotation } from '@langchain/langgraph';

import type { RoutedSkill } from '../../motionly-skills/router.js';
import type { ChatMessage, MotionlyGeneration } from '../providers/model.provider.js';
import type { Intent } from '../schemas/intent.schema.js';
import type { ValidationError } from '../validation/generation-validator.js';
import type { MotionGraphResponse, MotionlyProject } from './dependencies.js';

function replace<T>(_current: T, next: T): T {
    return next;
}

/**
 * One shared state for every node. Input channels mirror `MotionGraphInput`; the
 * remaining channels are filled in as the graph progresses.
 */
export const MotionGraphAnnotation = Annotation.Root({
    userId: Annotation<string>,
    workspaceId: Annotation<string>,
    projectId: Annotation<string | undefined>,
    message: Annotation<string>,
    runtimeError: Annotation<{ message: string } | undefined>,
    revision: Annotation<number | undefined>,

    startedAtMs: Annotation<number>({ reducer: replace, default: () => 0 }),
    intent: Annotation<Intent | undefined>,
    project: Annotation<MotionlyProject | undefined>,
    recentMessages: Annotation<ChatMessage[]>({ reducer: replace, default: () => [] }),
    selectedSkills: Annotation<RoutedSkill[]>({ reducer: replace, default: () => [] }),
    generation: Annotation<MotionlyGeneration | undefined>,
    validationErrors: Annotation<ValidationError[]>({ reducer: replace, default: () => [] }),
    repairAttempts: Annotation<number>({ reducer: replace, default: () => 0 }),
    savedRevision: Annotation<number | undefined>,
    response: Annotation<MotionGraphResponse | undefined>,
});

export type MotionGraphState = typeof MotionGraphAnnotation.State;
export type MotionGraphUpdate = typeof MotionGraphAnnotation.Update;
