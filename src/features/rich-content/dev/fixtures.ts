/// <reference types="expo/types/metro-require" />

import manifestJson from '../fixtures/manifest.json';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
  type RichContentDevFixture,
  type RichContentFixtureSummary,
} from './fixtureDecoder';

export type {
  RichContentDevFixture,
  RichContentFixtureSummary,
} from './fixtureDecoder';

const fixtureContext = __DEV__
  ? require.context('../fixtures/cases', true, /\.json$/)
  : null;
const fixtureSummaries = parseRichContentFixtureManifest(manifestJson);

export function getRichContentFixtureSummaries(): RichContentFixtureSummary[] {
  return fixtureSummaries;
}

function getFixtureModuleKey(file: string): string {
  const prefix = './cases/';
  if (!file.startsWith(prefix)) {
    throw new Error(`fixture file must be inside cases/: ${file}`);
  }
  return `./${file.slice(prefix.length)}`;
}

export function getRichContentDevFixture(
  fixtureId: string,
): RichContentDevFixture | null {
  if (!__DEV__ || !fixtureContext) return null;

  const summary = fixtureSummaries.find((item) => item.id === fixtureId);
  if (!summary) return null;

  const moduleKey = getFixtureModuleKey(summary.file);
  if (!fixtureContext.keys().includes(moduleKey)) {
    throw new Error(`fixture module not found: ${summary.file}`);
  }

  return decodeRichContentDevFixture(summary, fixtureContext(moduleKey));
}
