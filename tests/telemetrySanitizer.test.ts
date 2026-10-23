import type { Event } from '@sentry/react-native';
import {
  getSentryBuildIdentity,
  sanitizeSentryEvent,
  type TelemetryBuildContext,
} from '../src/utils/telemetrySanitizer';

const build: TelemetryBuildContext = {
  appVersion: '0.9.2',
  applicationId: 'com.example.zhihu',
  buildNumber: '37',
  commit: 'a'.repeat(40),
  sourceFingerprint: 'b'.repeat(24),
  sourceFiles: ['components/RecentMoments.tsx'],
  osVersion: '27.0',
  platform: 'ios',
  environment: 'development',
};

test('retains an actionable cause, build, location and fixed context without runtime values', () => {
  const secret = 'synthetic-private-token';
  const event: Event = {
    exception: {
      values: [
        {
          type: 'TypeError',
          value: "Cannot read properties of undefined (reading 'length')",
          stacktrace: {
            frames: [
              {
                filename: `/Users/${secret}/project/components/RecentMoments.tsx?Cookie=${secret}`,
                function: secret,
                vars: { Cookie: secret },
                context_line: secret,
                lineno: 43,
                colno: 9,
                debug_id: '12345678-1234-1234-1234-123456789abc',
              },
            ],
          },
        },
      ],
    },
    contexts: {
      diagnostic: {
        area: 'following.recent-moments',
        operation: 'render',
        route: secret,
      },
    },
    tags: { Cookie: secret, error_code: secret },
    extra: { response: secret },
  };
  const safe = sanitizeSentryEvent(event, build);
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe?.exception?.values?.[0]).toEqual({
    type: 'TypeError',
    value: "Cannot read property 'length' of undefined",
    stacktrace: {
      frames: [
        {
          filename: 'components/RecentMoments.tsx',
          abs_path: 'components/RecentMoments.tsx',
          lineno: 43,
          colno: 9,
          debug_id: '12345678-1234-1234-1234-123456789abc',
        },
      ],
    },
  });
  expect(safe?.tags).toEqual({
    app_version: '0.9.2',
    build_number: '37',
    commit: 'a'.repeat(40),
    source_fingerprint: 'b'.repeat(24),
    platform: 'ios',
    error_code: 'js.undefined-property',
  });
  expect(safe?.contexts?.diagnostic).toEqual({
    area: 'following.recent-moments',
    operation: 'render',
  });
  expect(safe?.contexts?.app).toEqual({
    app_version: '0.9.2',
    app_build: '37',
  });
  expect(safe).not.toBeNull();
  if (safe) expect(sanitizeSentryEvent(safe, build)).toEqual(safe);
});

test.each(['android', 'ios'] as const)(
  '%s events use the release and dist of the native upload instead of incoming metadata',
  (platform) => {
    const safe = sanitizeSentryEvent<Event>(
      { release: 'synthetic-private-value', dist: 'synthetic-private-value' },
      { ...build, platform },
    );
    expect(safe).toMatchObject({
      release: 'com.example.zhihu@0.9.2+37',
      dist: '37',
    });
    expect(JSON.stringify(safe)).not.toContain('synthetic-private-value');
    expect(getSentryBuildIdentity({ ...build, platform })).toEqual({
      release: safe?.release,
      dist: safe?.dist,
    });
  },
);

test.each([
  { applicationId: 'https://private.invalid/session' },
  { applicationId: 'private@example.invalid' },
  { appVersion: 'synthetic-private-version' },
  { buildNumber: 'synthetic-private-build' },
])('invalid native release components cannot enter events: %s', (metadata) => {
  const safe = sanitizeSentryEvent<Event>(
    { release: 'synthetic-private-release', dist: 'synthetic-private-dist' },
    { ...build, ...metadata },
  );
  expect(safe?.release).toBeUndefined();
  expect(JSON.stringify(safe)).not.toContain('synthetic-private');
  expect(JSON.stringify(safe)).not.toContain('private.invalid');
});

test('retains matching sanitized abs_path and code_file for Debug ID association', () => {
  const debugId = '12345678-1234-1234-1234-123456789abc';
  const path = 'app:///index.android.bundle?cookie=synthetic-private';
  const safe = sanitizeSentryEvent<Event>(
    {
      exception: {
        values: [
          {
            stacktrace: { frames: [{ filename: path, lineno: 1, colno: 50 }] },
          },
        ],
      },
      debug_meta: {
        images: [{ type: 'sourcemap', debug_id: debugId, code_file: path }],
      },
    },
    build,
  );
  const frame = safe?.exception?.values?.[0].stacktrace?.frames?.[0];
  const image = safe?.debug_meta?.images?.[0];
  expect(frame?.abs_path).toBe('app:///index.android.bundle');
  expect(frame?.abs_path).toBe(image?.code_file);
  expect(image?.debug_id).toBe(debugId);
  expect(JSON.stringify(safe)).not.toContain('synthetic-private');
  if (safe) expect(sanitizeSentryEvent(safe, build)).toEqual(safe);
});

test('rejects unexpected build identifiers and contextual runtime strings', () => {
  const secret = 'synthetic-private-token';
  const safe = sanitizeSentryEvent<Event>(
    {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: `Cannot read property '${secret}' of null`,
          },
        ],
      },
      contexts: { diagnostic: { area: secret, operation: secret } },
    },
    {
      ...build,
      buildNumber: secret,
      commit: secret,
      sourceFingerprint: secret,
    },
  );
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe?.tags).toEqual({
    app_version: '0.9.2',
    platform: 'ios',
    error_code: 'js.null-property',
  });
  expect(safe?.exception?.values?.[0].value).toBe(
    "Cannot read property '<redacted>' of null",
  );
  expect(safe?.contexts?.diagnostic).toBeUndefined();
});
