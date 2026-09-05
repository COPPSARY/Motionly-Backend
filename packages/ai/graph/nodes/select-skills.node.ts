import { routeSkills } from '../../../motionly-skills/router.js';
import { requireGenerationIntent, type ResolvedMotionGraphDependencies } from '../dependencies.js';
import type { MotionGraphState, MotionGraphUpdate } from '../state.js';

/**
 * Loads the skill bundle once and keeps only the guidance this request needs, so
 * prompts stay small. `core` is always selected by the router.
 */
export function createSelectSkillsNode(dependencies: ResolvedMotionGraphDependencies) {
    return async (state: MotionGraphState): Promise<MotionGraphUpdate> => ({
        selectedSkills: routeSkills(await dependencies.loadSkills(), {
            intent: requireGenerationIntent(state.intent),
            prompt: state.message,
        }),
    });
}
