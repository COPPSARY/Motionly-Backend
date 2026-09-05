import { requireCandidate, type ResolvedMotionGraphDependencies } from '../dependencies.js';
import type { MotionGraphState, MotionGraphUpdate } from '../state.js';

/** Checks the candidate deterministically. Generated source is never executed. */
export function createValidateNode(dependencies: ResolvedMotionGraphDependencies) {
    return (state: MotionGraphState): MotionGraphUpdate => ({
        validationErrors: dependencies.validate(requireCandidate(state.generation)).errors,
    });
}
