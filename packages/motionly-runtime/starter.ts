import {
  createQualityStarterSource,
  QUALITY_STARTER_SOURCE_FILES,
  type QualityStarterProjectSettings,
} from './quality-starter.js';

export const MOTIONLY_RUNTIME_VERSION = '2.0.0';
export const MOTIONLY_SKILL_BUNDLE_VERSION = '1.0.0';

export type StarterProjectSettings = QualityStarterProjectSettings;

export function createStarterSource(settings: StarterProjectSettings) {
  return createQualityStarterSource(settings);
}

export const STARTER_SOURCE_FILES = QUALITY_STARTER_SOURCE_FILES;
