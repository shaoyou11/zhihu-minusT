import Constants from 'expo-constants';
import { osVersion } from 'expo-device';
import { Platform } from 'react-native';
import type { TelemetryBuildContext } from './telemetrySanitizer';

const SOURCE_ROOTS = new Set([
  'app',
  'components',
  'hooks',
  'utils',
  'api',
  'features',
  'storage',
  'store',
  'types',
  'constants',
]);
const EXCLUDED_DIRECTORIES = new Set([
  'fixtures',
  'tests',
  '__tests__',
  '__mocks__',
  'assets',
  'node_modules',
  'build',
  'dist',
  'vendor',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function version(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length < 40 &&
    /^\d+(?:[._-]\d+){0,4}$/.test(value)
    ? value
    : undefined;
}

function applicationId(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= 255 &&
    /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(value)
    ? value
    : undefined;
}

function androidBuild(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : undefined;
}

function hex(value: unknown, length: number): string | undefined {
  return typeof value === 'string' &&
    new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value)
    ? value.toLowerCase()
    : undefined;
}

function sourceFile(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 240 ||
    !/\.(?:[cm]?jsx?|tsx?|swift|m|mm|h|java|kt)$/.test(value) ||
    /\.(?:test|spec)\.[^/]+$/.test(value)
  )
    return false;
  const segments = value.split('/');
  // Older installed builds may still expose the pre-src manifest paths.
  const rootIndex = segments[0] === 'src' ? 1 : 0;
  const knownRoot =
    SOURCE_ROOTS.has(segments[rootIndex]) ||
    (rootIndex === 0 && segments[0] === 'modules');
  return (
    segments.length >= rootIndex + 2 &&
    knownRoot &&
    segments.every(
      (segment) =>
        !segment.startsWith('.') &&
        /^[\w()[\]+.-]+$/.test(segment) &&
        !EXCLUDED_DIRECTORIES.has(segment) &&
        !/(?:^|[._-])(?:config|env|secrets?|credentials?)(?:[._-]|$)/i.test(
          segment,
        ),
    )
  );
}

/** Shared metadata for local diagnostics and telemetry, with no device/user identifiers. */
export function getTelemetryBuildContext(): TelemetryBuildContext {
  const candidate: unknown = Constants.expoConfig?.extra?.diagnostics;
  const diagnostics = isRecord(candidate) ? candidate : {};
  const sourceFiles = Array.isArray(diagnostics.sourceFiles)
    ? [...new Set(diagnostics.sourceFiles.filter(sourceFile))]
    : undefined;
  const platform =
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other';
  const nativeBuildNumber =
    platform === 'ios'
      ? version(Constants.platform?.ios?.buildNumber)
      : platform === 'android'
        ? androidBuild(Constants.platform?.android?.versionCode)
        : undefined;
  const configuredBuildNumber =
    platform === 'ios'
      ? version(Constants.expoConfig?.ios?.buildNumber)
      : platform === 'android'
        ? androidBuild(Constants.expoConfig?.android?.versionCode)
        : undefined;
  return {
    appVersion: version(Constants.expoConfig?.version),
    applicationId: applicationId(
      platform === 'ios'
        ? Constants.expoConfig?.ios?.bundleIdentifier
        : platform === 'android'
          ? Constants.expoConfig?.android?.package
          : undefined,
    ),
    buildNumber: nativeBuildNumber ?? configuredBuildNumber,
    osVersion: version(osVersion),
    commit: hex(diagnostics.commit, 40),
    sourceFingerprint: hex(diagnostics.sourceFingerprint, 24),
    sourceFiles,
    platform,
    environment: __DEV__ ? 'development' : 'production',
  };
}
