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
  const requiredIds = ['core'];
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
  const maxCharacters = input.maxCharacters ?? 12_000;
  const requiredCharacters = required.reduce((total, skill) => total + skill.content.length, 0);
  if (requiredCharacters > maxCharacters) throw new Error('Motionly required skills exceed the routing character budget.');
  const preferredIds = input.intent === 'CREATE' ? ['write-motionly', 'quality-reference', 'code-authoring', 'typography'] : [];
  let characters = requiredCharacters;
  const preferredSkills = preferredIds.map((id) => bundle.skills.find((skill) => skill.id === id)).filter(
    (skill): skill is LoadedSkill => skill !== undefined,
  );
  const preferredCharacters = preferredSkills.reduce((total, skill) => total + skill.content.length, 0);
  if (characters + preferredCharacters <= maxCharacters) {
    for (const skill of preferredSkills) {
      selected.push({
        id: skill.id,
        version: bundle.manifest.version,
        sha256: skill.sha256,
        reason: 'Baseline guidance for authored Motionly compositions.',
        content: skill.content,
      });
    }
    characters += preferredCharacters;
  }
  const candidates = bundle.skills.filter((skill) => !requiredIds.includes(skill.id)).map((skill) => {
    const matches = skill.tags.filter((tag) => haystack.includes(tag.toLowerCase()));
    return { skill, matches };
  }).filter((candidate) => candidate.matches.length > 0)
    .sort((left, right) => right.matches.length - left.matches.length || left.skill.id.localeCompare(right.skill.id));

  for (const { skill, matches } of candidates) {
    if (selected.length >= 5) break;
    if (selected.some((selectedSkill) => selectedSkill.id === skill.id)) continue;
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
