import { buildRepairSystemPrompt, buildRepairUserPrompt, REPAIR_LIMITS } from '../../prompts/repair.prompt.js';
import {
    requireCandidate,
    requireGenerationIntent,
    type ResolvedMotionGraphDependencies,
} from '../dependencies.js';
import type { MotionGraphState, MotionGraphUpdate } from '../state.js';

/**
 * Sends the rejected candidate back with its diagnostics so the model corrects that
 * candidate instead of redesigning the project. Attempts are counted and bounded.
 */
export function createRepairNode(dependencies: ResolvedMotionGraphDependencies) {
    return async (state: MotionGraphState): Promise<MotionGraphUpdate> => ({
        repairAttempts: state.repairAttempts + 1,
        generation: await dependencies.provider.generate({
            model: dependencies.model,
            systemInstructions: buildRepairSystemPrompt(state.selectedSkills),
            prompt: buildRepairUserPrompt({
                intent: requireGenerationIntent(state.intent),
                message: state.message,
                project: state.project,
                candidate: requireCandidate(state.generation),
                errors: state.validationErrors,
            }),
            limits: REPAIR_LIMITS,
        }),
    });
}
