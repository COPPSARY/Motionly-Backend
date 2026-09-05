import { buildMotionSystemPrompt, buildMotionUserPrompt, GENERATION_LIMITS } from '../../prompts/motion.prompt.js';
import { requireGenerationIntent, type ResolvedMotionGraphDependencies } from '../dependencies.js';
import type { MotionGraphState, MotionGraphUpdate } from '../state.js';

/**
 * Produces one schema-constrained candidate from the request, the current project
 * source, bounded history, and the selected skills. Nothing else is sent.
 */
export function createGenerateNode(dependencies: ResolvedMotionGraphDependencies) {
    return async (state: MotionGraphState): Promise<MotionGraphUpdate> => ({
        generation: await dependencies.provider.generate({
            model: dependencies.model,
            systemInstructions: buildMotionSystemPrompt(state.selectedSkills),
            prompt: buildMotionUserPrompt({
                intent: requireGenerationIntent(state.intent),
                message: state.message,
                project: state.project,
                recentMessages: state.recentMessages,
                runtimeError: state.runtimeError,
            }),
            limits: GENERATION_LIMITS,
        }),
    });
}
