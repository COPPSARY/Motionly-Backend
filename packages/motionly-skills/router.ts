import type { LoadedSkill, SkillManifest } from './loader.js';

export interface SkillRouteInput {
    prompt: string;
    intent: 'CREATE' | 'EDIT' | 'FIX';
    assetTypes?: string[];
    maxCharacters?: number;
}

export interface RoutedSkill {
    id: string;
    version: string;
    reason: string;
    content: string;
}

export function routeSkills(
    bundle: { manifest: SkillManifest; skills: LoadedSkill[] },
    input: SkillRouteInput,
): RoutedSkill[] {
    const haystack = `${input.intent} ${input.prompt} ${(input.assetTypes ?? []).join(' ')}`.toLowerCase();
    const maxCharacters = input.maxCharacters ?? Number.POSITIVE_INFINITY;
    const selected: RoutedSkill[] = [];
    const selectedIds = new Set<string>();
    let characters = 0;

    const candidates = bundle.skills
        .filter((skill) => !selectedIds.has(skill.id))
        .map((skill) => ({
            skill,
            matches: skill.tags.filter((tag) => haystack.includes(tag.toLowerCase())),
        }))
        .filter((candidate) => candidate.matches.length > 0)
        .sort((left, right) => (
            right.matches.length - left.matches.length
            || left.skill.id.localeCompare(right.skill.id)
        ));

    for (const { skill, matches } of candidates) {
        if (characters + skill.content.length > maxCharacters) continue;
        selected.push(toRoutedSkill(
            skill,
            bundle.manifest.version,
            `Matched: ${matches.join(', ')}`,
        ));
        selectedIds.add(skill.id);
        characters += skill.content.length;
    }

    return selected;
}

function toRoutedSkill(skill: LoadedSkill, version: string, reason: string): RoutedSkill {
    return {
        id: skill.id,
        version,
        reason,
        content: skill.content,
    };
}
