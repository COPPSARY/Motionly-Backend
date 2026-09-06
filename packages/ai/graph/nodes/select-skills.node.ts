import { routeSkills } from '../../../motionly-skills/router.js';
import { requireGenerationIntent, type ResolvedMotionGraphDependencies } from '../dependencies.js';
import type { MotionGraphState, MotionGraphUpdate } from '../state.js';

/**
 * Loads the skill bundle once and keeps only the guidance this request needs, so
 * prompts stay small. `core` is always selected by the router.
 */
export function createSelectSkillsNode(dependencies: ResolvedMotionGraphDependencies) {
    return async (state: MotionGraphState): Promise<MotionGraphUpdate> => {
        const intent = requireGenerationIntent(state.intent);
        const bundle = await dependencies.loadSkills();
        const selectedSkills = routeSkills(bundle, {
            intent,
            prompt: state.message,
        });
        dependencies.onSkillsSelected({
            intent,
            manifestVersion: bundle.manifest.version,
            skills: selectedSkills.map(({ id, reason }) => ({ id, reason })),
            totalCharacters: selectedSkills.reduce(
                (total, skill) => total + skill.content.length,
                0,
            ),
        });
        return { selectedSkills };
    };
}
