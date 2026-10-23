import {
  classifyDiagnosticMessage,
  sanitizeCodeFilename,
  sanitizeDiagnosticContext,
} from '../src/utils/errorDiagnostics';

describe('safe diagnostic messages', () => {
  test.each([
    [
      "Cannot read properties of undefined (reading 'length')",
      'js.undefined-property',
      "Cannot read property 'length' of undefined",
    ],
    [
      "Cannot read property 'id' of undefined",
      'js.undefined-property',
      "Cannot read property 'id' of undefined",
    ],
    [
      "Cannot read property 'avatar_url' of undefined",
      'js.undefined-property',
      "Cannot read property 'avatar_url' of undefined",
    ],
    [
      "Cannot read property 'map' of null",
      'js.null-property',
      "Cannot read property 'map' of null",
    ],
    [
      "undefined is not an object (evaluating 'privateAccount.data.length')",
      'js.undefined-property',
      "Cannot read property 'length' of undefined",
    ],
    [
      "null is not an object (evaluating 'privateAccount[privateToken]')",
      'js.null-property',
      "Cannot read property '<redacted>' of null",
    ],
    [
      "Cannot read properties of undefined (reading 'synthetic-private-token')",
      'js.undefined-property',
      "Cannot read property '<redacted>' of undefined",
    ],
    [
      'privateAccount.data.map is not a function (it is undefined)',
      'js.not-a-function',
      "Property 'map' is not a function",
    ],
    [
      'account.syntheticPrivateToken is not a function',
      'js.not-a-function',
      "Property '<redacted>' is not a function",
    ],
    [
      'undefined is not a function',
      'js.not-a-function',
      'Value is not a function',
    ],
    [
      'Cannot convert undefined value to object',
      'js.invalid-object',
      'Cannot convert undefined or null to object',
    ],
    [
      'Maximum call stack size exceeded.',
      'js.stack-overflow',
      'Maximum call stack size exceeded',
    ],
    [
      'Rendered fewer hooks than expected. synthetic-private-detail',
      'react.hook-order',
      'React hook order changed',
    ],
    [
      'Rendered more hooks than during the previous render.',
      'react.hook-order',
      'React hook order changed',
    ],
    [
      'Maximum update depth exceeded. synthetic-private-detail',
      'react.update-depth',
      'Maximum update depth exceeded',
    ],
    ['HTTP failure: 503', 'http.failure', 'HTTP failure: 503'],
    ['Network failure: timeout', 'network.failure', 'Network failure: timeout'],
  ])(
    'classifies %s and remains safe after reading it back',
    (input, code, summary) => {
      const expected = { code, summary };
      expect(classifyDiagnosticMessage(input)).toEqual(expected);
      expect(classifyDiagnosticMessage(summary)).toEqual(expected);
    },
  );

  test.each([
    'Cookie: z_c0=synthetic-private-token',
    'Request failed: https://example.invalid/login?token=synthetic-private-token',
    'HTTP failure: 503 Cookie: synthetic-private-token',
    "Cannot read properties of undefined (reading 'length') synthetic-private-token",
    'Network failure: synthetic-private-token',
    "Cannot read property 'data\nsynthetic-private-token' of undefined",
    { message: 'synthetic-private-token' },
    undefined,
    'x'.repeat(4097),
  ])('does not retain arbitrary error content', (message) => {
    expect(classifyDiagnosticMessage(message)).toEqual({
      code: 'application.unknown',
      summary: 'Application failure',
    });
  });
});

describe('safe source locations', () => {
  test('drops JSC-safe Metro query encoding without losing the bundle name', () => {
    expect(
      sanitizeCodeFilename(
        'http://private.invalid:8082/node_modules/expo-router/entry.bundle//&platform=ios&cookie=synthetic-private',
      ),
    ).toBe('entry.bundle');
  });
  const sourceFiles = ['components/RecentMoments.tsx', 'app/(tabs)/index.tsx'];
  test.each([
    'components/RecentMoments.tsx',
    '/Users/synthetic-private-user/project/components/RecentMoments.tsx',
    'https://synthetic-private-host.invalid/components/RecentMoments.tsx?token=synthetic-private-token#account',
    'C:\\synthetic-private-user\\components\\RecentMoments.tsx',
  ])(
    'keeps the exact repository file without the machine or URL',
    (filename) => {
      expect(sanitizeCodeFilename(filename, sourceFiles)).toBe(
        'components/RecentMoments.tsx',
      );
    },
  );
  test('keeps encoded route filenames only when present in the build allowlist', () => {
    expect(
      sanitizeCodeFilename(
        'http://private.invalid/app/%28tabs%29/index.tsx',
        sourceFiles,
      ),
    ).toBe('app/(tabs)/index.tsx');
  });
  test('keeps Expo plus-prefixed route filenames in the build allowlist', () => {
    expect(
      sanitizeCodeFilename(
        'http://private.invalid/app/+native-intent.ts?token=synthetic-private-token',
        ['app/+native-intent.ts'],
      ),
    ).toBe('app/+native-intent.ts');
  });
  test('does not mistake an arbitrary filename or suffix for repository code', () => {
    expect(
      sanitizeCodeFilename('/private/synthetic-token.tsx', sourceFiles),
    ).toBe('source.js');
    expect(
      sanitizeCodeFilename(
        '/private/notcomponents/RecentMoments.tsx',
        sourceFiles,
      ),
    ).toBe('source.js');
    expect(
      sanitizeCodeFilename(
        '/private/../components/RecentMoments.tsx',
        sourceFiles,
      ),
    ).toBeUndefined();
    expect(
      sanitizeCodeFilename('https://private.invalid/file.tsx', ['../file.tsx']),
    ).toBe('source.js');
  });
  test('keeps known bundles and scrubs parameters without a source allowlist', () => {
    expect(
      sanitizeCodeFilename(
        'app:///index.ios.bundle?token=synthetic-private-token',
      ),
    ).toBe('app:///index.ios.bundle');
    expect(
      sanitizeCodeFilename(
        'http://private.invalid/node_modules/expo-router/entry.bundle?dev=true',
      ),
    ).toBe('entry.bundle');
    expect(
      sanitizeCodeFilename('/private/synthetic-token.txt'),
    ).toBeUndefined();
  });
  test.each(['.virtual-metro-entry', '.virtual-metro-entry.bundle'])(
    'keeps the known Expo development entry %s without the host or parameters',
    (entry) => {
      expect(
        sanitizeCodeFilename(
          `http://private.invalid/node_modules/.expo/${entry}?token=synthetic-private-token`,
        ),
      ).toBe('entry.bundle');
    },
  );
});

test('keeps only explicitly allowed diagnostic context fields', () => {
  expect(
    sanitizeDiagnosticContext({
      area: 'following.recent-moments',
      operation: 'render',
      route: '/user/synthetic-private-account',
      payload: 'synthetic-private-token',
    }),
  ).toEqual({ area: 'following.recent-moments', operation: 'render' });
  expect(
    sanitizeDiagnosticContext({ area: '/user/private', operation: 'render' }),
  ).toEqual({ operation: 'render' });
  expect(
    sanitizeDiagnosticContext({ area: '/user/private', operation: 'private' }),
  ).toBeUndefined();
});
