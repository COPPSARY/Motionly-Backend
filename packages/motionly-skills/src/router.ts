import type { LoadedSkill, SkillManifest } from './loader.js';

export interface SkillRouteInput {
  prompt: string;
  intent: 'CREATE' | 'EDIT';
  assetTypes?: string[];
  maxCharacters?: number;
}

export interface RoutedSkill {
  id: string;
  version: string;
  sha256: string;
  reason: string;
  content: string;
}

export function routeSkills(
  bundle: { manifest: SkillManifest; skills: LoadedSkill[] },
  input: SkillRouteInput,
): RoutedSkill[] {
  const haystack = `${input.intent} ${input.prompt} ${(input.assetTypes ?? []).join(' ')}`.toLowerCase();
  const requiredIds = ['core', 'helpers', 'quality-reference'];
  const required = requiredIds.map((id) => {
    const skill = bundle.skills.find((candidate) => candidate.id === id);
    if (!skill) throw new Error(`Required Motionly skill is missing: ${id}`);
    return skill;
  });
  const selected: RoutedSkill[] = required.map((skill) => ({
    id: skill.id,
    version: bundle.manifest.version,
    sha256: skill.sha256,
    reason: 'Required for every Motionly generation.',
    content: skill.content,
  }));
  const maxCharacters = input.maxCharacters ?? 24_000;
  const requiredCharacters = required.reduce((total, skill) => total + skill.content.length, 0);
  if (requiredCharacters > maxCharacters) throw new Error('Motionly required skills exceed the routing character budget.');
  const candidates = bundle.skills.filter((skill) => !requiredIds.includes(skill.id)).map((skill) => {
    const matches = skill.tags.filter((tag) => haystack.includes(tag.toLowerCase()));
    return { skill, matches };
  }).filter((candidate) => candidate.matches.length > 0)
    .sort((left, right) => right.matches.length - left.matches.length || left.skill.id.localeCompare(right.skill.id));

  let characters = requiredCharacters;
  for (const { skill, matches } of candidates) {
    if (characters + skill.content.length > maxCharacters) continue;
    selected.push({
      id: skill.id,
      version: bundle.manifest.version,
      sha256: skill.sha256,
      reason: `Matched: ${matches.join(', ')}`,
      content: skill.content,
    });
    characters += skill.content.length;
  }
  return selected;
}
