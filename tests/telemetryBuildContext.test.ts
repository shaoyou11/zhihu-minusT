import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getTelemetryBuildContext } from '../src/utils/telemetryBuildContext';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '0.9.2',
      ios: { bundleIdentifier: 'com.example.zhihu', buildNumber: '41' },
      android: { package: 'com.example.zhihu.android', versionCode: 903 },
      extra: {},
    },
    platform: { ios: { buildNumber: '42' } },
  },
}));
jest.mock('expo-device', () => ({ osVersion: '27.0.1' }));

beforeEach(() => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {};
  jest.replaceProperty(Platform, 'OS', 'ios');
});

afterEach(() => jest.restoreAllMocks());

test('returns shared version, build, system and source identifiers', () => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {
    diagnostics: {
      commit: 'A'.repeat(40),
      sourceFingerprint: 'B'.repeat(24),
      sourceFiles: [
        'src/components/RecentMoments.tsx',
        'src/app/(tabs)/index.tsx',
      ],
    },
  };
  expect(getTelemetryBuildContext()).toEqual({
    appVersion: '0.9.2',
    applicationId: 'com.example.zhihu',
    buildNumber: '42',
    osVersion: '27.0.1',
    platform: 'ios',
    environment: 'development',
    commit: 'a'.repeat(40),
    sourceFingerprint: 'b'.repeat(24),
    sourceFiles: [
      'src/components/RecentMoments.tsx',
      'src/app/(tabs)/index.tsx',
    ],
  });
});

test('uses the native iOS build number exposed by Expo Constants in a dev client', () => {
  const originalPlatform = Constants.platform;
  if (!originalPlatform?.ios)
    throw new Error('Missing synthetic iOS constants');
  try {
    Constants.platform = {
      ios: { ...originalPlatform.ios, buildNumber: '17' },
    };
    expect(getTelemetryBuildContext().buildNumber).toBe('17');
    Constants.platform = {
      ios: { ...originalPlatform.ios, buildNumber: 'synthetic-private' },
    };
    expect(getTelemetryBuildContext().buildNumber).toBe('41');
  } finally {
    Constants.platform = originalPlatform;
  }
});

test('uses Android config when Expo Constants has no native version code or platform hint', () => {
  const originalPlatform = Constants.platform;
  try {
    jest.replaceProperty(Platform, 'OS', 'android');
    Constants.platform = undefined;
    expect(getTelemetryBuildContext()).toMatchObject({
      platform: 'android',
      applicationId: 'com.example.zhihu.android',
      buildNumber: '903',
    });
  } finally {
    Constants.platform = originalPlatform;
  }
});

test('prefers the native Android version code over a changed Expo config', () => {
  const originalPlatform = Constants.platform;
  try {
    jest.replaceProperty(Platform, 'OS', 'android');
    Constants.platform = { android: { versionCode: 901 } };
    expect(getTelemetryBuildContext().buildNumber).toBe('901');
  } finally {
    Constants.platform = originalPlatform;
  }
});

test('rejects application identifiers containing runtime strings or URL data', () => {
  const ios = Constants.expoConfig?.ios;
  if (!ios) throw new Error('Missing test config');
  const originalId = ios.bundleIdentifier;
  try {
    ios.bundleIdentifier = 'https://private.invalid/?cookie=synthetic-private';
    expect(getTelemetryBuildContext().applicationId).toBeUndefined();
  } finally {
    ios.bundleIdentifier = originalId;
  }
});

test('accepts native modules and source paths from older build manifests', () => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {
    diagnostics: {
      sourceFiles: [
        'modules/native/Example.swift',
        'components/RecentMoments.tsx',
        'app/(tabs)/index.tsx',
        'components/../private.ts',
        'utils/secrets.ts',
        'features/rich-content/fixtures/private.ts',
      ],
    },
  };
  expect(getTelemetryBuildContext().sourceFiles).toEqual([
    'modules/native/Example.swift',
    'components/RecentMoments.tsx',
    'app/(tabs)/index.tsx',
  ]);
});

test('rejects unsafe manifest values and limits filenames to relative source paths', () => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {
    diagnostics: {
      commit: 'synthetic-private-data',
      sourceFingerprint: 'https://example.invalid/private',
      sourceFiles: [
        'src/components/RecentMoments.tsx',
        'src/components/RecentMoments.tsx',
        '/private/user/app.tsx',
        'src/private.ts',
        'src/unknown/private.ts',
        'src/modules/private.ts',
        'src/components/../../private.ts',
        'src/components/../private.ts',
        'src/components/RecentMoments.tsx?cookie=private',
        'app\\private.ts',
        'src/features/rich-content/fixtures/private.ts',
        'src/utils/env.ts',
        'src/utils/secrets.ts',
        'src/utils/config/private.ts',
        'src/components/__tests__/private.tsx',
        'src/components/RecentMoments.test.tsx',
        42,
        null,
      ],
    },
  };
  expect(getTelemetryBuildContext()).toMatchObject({
    commit: undefined,
    sourceFingerprint: undefined,
    sourceFiles: ['src/components/RecentMoments.tsx'],
  });
});

test.each([undefined, null, [], 'invalid', { sourceFiles: 'invalid' }])(
  'supports builds without a valid source manifest: %s',
  (diagnostics) => {
    if (!Constants.expoConfig) throw new Error('Missing test config');
    Constants.expoConfig.extra = { diagnostics };
    expect(getTelemetryBuildContext()).toMatchObject({
      appVersion: '0.9.2',
      buildNumber: '42',
      sourceFiles: undefined,
    });
  },
);
