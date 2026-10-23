import type { Event } from '@sentry/react-native';

const mockFiles = new Map<string, string>();
const mockFailures = new Set<string>();
const mockWrites = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '0.9.2',
      extra: {
        diagnostics: {
          commit: 'a'.repeat(40),
          sourceFingerprint: 'b'.repeat(24),
          sourceFiles: ['components/RecentMoments.tsx'],
        },
      },
    },
    nativeBuildVersion: '1',
    platform: { ios: { buildNumber: '1' } },
  },
}));

jest.mock('expo-device', () => ({ osVersion: '27.0' }));

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  File: class {
    private readonly path: string;
    constructor(...parts: string[]) {
      if (mockFailures.has('construct'))
        throw new Error('Unavailable filesystem');
      this.path = parts.join('/');
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    get size() {
      return mockFiles.get(this.path)?.length ?? 0;
    }
    textSync() {
      if (mockFailures.has('read') || mockFailures.has(`read:${this.path}`))
        throw new Error('Read failure');
      return mockFiles.get(this.path) ?? '';
    }
    writeSync(content: string) {
      if (mockFailures.has('write')) throw new Error('Write failure');
      mockWrites(content);
      mockFiles.set(this.path, content);
    }
    delete() {
      if (mockFailures.has('delete')) throw new Error('Delete failure');
      mockFiles.delete(this.path);
    }
  },
}));

function loadLogs(): typeof import('../src/utils/diagnosticLogs') {
  let result: typeof import('../src/utils/diagnosticLogs') | undefined;
  jest.isolateModules(() => {
    result = require('../src/utils/diagnosticLogs');
  });
  if (!result) throw new Error('Missing log module');
  return result;
}

beforeEach(() => {
  mockFiles.clear();
  mockFailures.clear();
  mockWrites.mockClear();
});

test('persists only whitelisted error details and code locations before returning', () => {
  const logs = loadLogs();
  const error = new TypeError('z_c0=synthetic-private-message');
  error.stack = [
    'TypeError: synthetic-private-message',
    '    at syntheticPrivateFunction (https://synthetic-private-host.invalid/index.bundle?token=synthetic-private-query:123:45)',
    'syntheticPrivateFunction@/private/synthetic-private-path/synthetic-private-file.tsx:20:2',
    '    at secret (native)',
  ].join('\n');
  Object.assign(error, {
    config: { headers: { Cookie: 'synthetic-private-cookie' } },
  });
  logs.recordDiagnosticError(error, 'react-render');
  expect(mockWrites).toHaveBeenCalledTimes(1);
  const snapshot = logs.readDiagnosticLogs();
  expect(snapshot.persistenceAvailable).toBe(true);
  expect(snapshot.entries).toHaveLength(1);
  expect(snapshot.entries[0]).toMatchObject({
    source: 'react-render',
    errorType: 'TypeError',
    message: 'Application failure',
    appVersion: '0.9.2',
    osVersion: '27.0',
    platform: 'ios',
    environment: 'development',
    frames: [
      { filename: 'source.js', lineno: 20, colno: 2 },
      { filename: 'index.bundle', lineno: 123, colno: 45 },
    ],
  });
  expect(JSON.stringify(snapshot)).not.toContain('synthetic-private');
  expect(JSON.stringify([...mockFiles.values()])).not.toContain(
    'synthetic-private',
  );
  expect(logs.formatDiagnosticLogsForExport()).not.toContain(
    'syntheticPrivateFunction',
  );
});

test('sanitizes automatic SDK events without retaining request data or messages', () => {
  const logs = loadLogs();
  const event: Event = {
    exception: {
      values: [
        {
          type: 'AxiosError',
          value: 'HTTP failure: 503',
          stacktrace: {
            frames: [
              {
                filename: '/private/index.js',
                lineno: 5,
                colno: 3,
                function: 'synthetic-private-function',
                vars: { secret: 'synthetic-private-value' },
              },
            ],
          },
        },
      ],
    },
    request: { url: 'https://example.invalid?z_c0=synthetic-private-cookie' },
    extra: { secret: 'synthetic-private-extra' },
    user: { email: 'synthetic-private@example.invalid' },
  };
  logs.recordDiagnosticEvent(event, 'unhandled-rejection');
  expect(logs.readDiagnosticLogs().entries[0]).toMatchObject({
    source: 'unhandled-rejection',
    errorType: 'AxiosError',
    message: 'HTTP failure: 503',
    frames: [{ filename: 'index.js', lineno: 5, colno: 3 }],
  });
  expect(JSON.stringify([...mockFiles.values()])).not.toContain(
    'synthetic-private',
  );
});

test('keeps actionable safe causes, scoped business locations, and build identity after restart', () => {
  jest.isolateModules(() => {
    const logs: typeof import('../src/utils/diagnosticLogs') = require('../src/utils/diagnosticLogs');
    const {
      rememberDiagnosticContext,
    }: typeof import('../src/utils/diagnosticContext') = require('../src/utils/diagnosticContext');
    const error = new TypeError("Cannot read property 'id' of undefined");
    error.stack = [
      `TypeError: ${error.message}`,
      '    at privateFunction (http://synthetic-private-host:8082/node_modules/expo-router/entry.bundle//&platform=ios&private=synthetic-private:2048:24)',
      '    at privateCaller (/private/synthetic-private-account/components/RecentMoments.tsx:67:22)',
    ].join('\n');
    Object.assign(error, {
      config: { headers: { Cookie: 'synthetic-private-cookie' } },
    });
    rememberDiagnosticContext(error, {
      area: 'following.recent-moments',
      operation: 'render',
    });
    logs.recordDiagnosticError(error, 'react-render');
  });
  const restored = loadLogs();
  expect(restored.readDiagnosticLogs().entries[0]).toMatchObject({
    errorCode: 'js.undefined-property',
    message: "Cannot read property 'id' of undefined",
    context: { area: 'following.recent-moments', operation: 'render' },
    buildNumber: '1',
    commit: 'a'.repeat(40),
    sourceFingerprint: 'b'.repeat(24),
    frames: [
      { filename: 'components/RecentMoments.tsx', lineno: 67, colno: 22 },
      { filename: 'entry.bundle', lineno: 2048, colno: 24 },
    ],
  });
  const exported = restored.formatDiagnosticLogsForExport();
  expect(exported).toContain('following.recent-moments / render');
  expect(exported).toContain('js.undefined-property');
  expect(exported).toContain('entry.bundle:2048:24');
  expect(exported).not.toContain('synthetic-private');
  expect(exported).not.toContain('privateFunction');
  expect(JSON.stringify([...mockFiles.values()])).not.toContain(
    'synthetic-private',
  );
});

test('masks dynamic property names while preserving the cause and validated debug IDs', () => {
  const logs = loadLogs();
  logs.recordDiagnosticEvent({
    contexts: {
      diagnostic: {
        area: 'following.recent-moments',
        operation: 'render',
        actor: 'synthetic-private-actor',
      },
    },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: "Cannot read property 'synthetic-private-property' of null",
          stacktrace: {
            frames: [
              {
                filename: 'index.bundle',
                lineno: 8,
                colno: 2,
                debug_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              },
            ],
          },
        },
      ],
    },
  });
  const restored = loadLogs();
  expect(restored.readDiagnosticLogs().entries[0]).toMatchObject({
    errorCode: 'js.null-property',
    message: "Cannot read property '<redacted>' of null",
    frames: [{ debug_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
  });
  expect(restored.formatDiagnosticLogsForExport()).not.toContain(
    'synthetic-private',
  );
});

test('reloads previous records after a restart and recovers from a torn newest write', () => {
  const logs = loadLogs();
  logs.recordDiagnosticError(new TypeError('first'));
  logs.recordDiagnosticError(new RangeError('second'));
  expect(
    loadLogs()
      .readDiagnosticLogs()
      .entries.map((entry) => entry.errorType),
  ).toEqual(['TypeError', 'RangeError']);
  mockFiles.set('file:///documents/diagnostic-errors-0.json', '{torn');
  expect(
    loadLogs()
      .readDiagnosticLogs()
      .entries.map((entry) => entry.errorType),
  ).toEqual(['TypeError']);
});

test('bounds history and stack sizes without retaining mutable caller objects', () => {
  const logs = loadLogs();
  const error = new Error('private');
  error.stack =
    'Error: private\n' +
    Array.from(
      { length: 200 },
      (_, index) => `    at secret (app:///index.bundle:${index + 1}:2)`,
    ).join('\n');
  for (let index = 0; index < 45; index += 1) logs.recordDiagnosticError(error);
  const snapshot = logs.readDiagnosticLogs();
  expect(snapshot.entries).toHaveLength(30);
  expect(snapshot.entries.every((entry) => entry.frames.length === 12)).toBe(
    true,
  );
  expect(snapshot.entries[0]?.frames.at(-1)?.lineno).toBe(1);
  for (const raw of mockFiles.values())
    expect(raw.length).toBeLessThanOrEqual(64 * 1024);
  snapshot.entries[0].message = 'synthetic-private-mutated';
  snapshot.entries.length = 0;
  expect(logs.readDiagnosticLogs().entries).toHaveLength(30);
  expect(logs.formatDiagnosticLogsForExport()).not.toContain(
    'synthetic-private-mutated',
  );
});

test('resanitizes stored data and ignores oversized or invalid snapshots', () => {
  mockFiles.set(
    'file:///documents/diagnostic-errors-0.json',
    JSON.stringify({
      version: 1,
      revision: 2,
      entries: [
        {
          timestamp: '2026-10-20T01:02:03.000Z',
          source: 'synthetic-private-source',
          errorType: 'synthetic-private-type',
          message: 'synthetic-private-message',
          appVersion: 'synthetic-private-version',
          osVersion: '27.0?synthetic-private',
          platform: 'synthetic-private-platform',
          environment: 'synthetic-private-env',
          frames: [
            {
              filename:
                'https://synthetic-private.invalid/index.bundle?secret=synthetic-private',
              lineno: 1,
              colno: 2,
              function: 'synthetic-private-function',
            },
          ],
          cookie: 'synthetic-private-cookie',
        },
      ],
    }),
  );
  mockFiles.set(
    'file:///documents/diagnostic-errors-1.json',
    'x'.repeat(65 * 1024),
  );
  const logs = loadLogs();
  const snapshot = logs.readDiagnosticLogs();
  expect(snapshot.entries).toHaveLength(1);
  expect(snapshot.entries[0]).toMatchObject({
    source: 'handled',
    errorType: 'Error',
    message: 'Application failure',
    platform: 'other',
  });
  expect(logs.formatDiagnosticLogsForExport()).not.toContain(
    'synthetic-private',
  );
  logs.recordDiagnosticError(new Error('new'));
  expect(
    [...mockFiles.values()].some((raw) => raw.includes('synthetic-private')),
  ).toBe(true);
  // Existing untrusted data is never copied into the newly written snapshot.
  expect(mockWrites.mock.calls.at(-1)?.[0]).not.toContain('synthetic-private');
});

test('isolates disk failures, keeps memory logs available, and retries later writes', () => {
  const logs = loadLogs();
  mockFailures.add('write');
  expect(() => logs.recordDiagnosticError(new Error('secret'))).not.toThrow();
  expect(logs.readDiagnosticLogs()).toMatchObject({
    entries: [expect.any(Object)],
    persistenceAvailable: false,
  });
  mockFailures.delete('write');
  logs.recordDiagnosticError(new RangeError('secret'));
  expect(logs.readDiagnosticLogs().persistenceAvailable).toBe(true);
  expect(loadLogs().readDiagnosticLogs().entries).toHaveLength(2);
});

test.each(['read', 'read:file:///documents/diagnostic-errors-0.json'])(
  'does not overwrite an unknown revision after %s fails, and merges pending records on recovery',
  (failure) => {
    const previousRun = loadLogs();
    for (let index = 0; index < 6; index += 1)
      previousRun.recordDiagnosticError(new TypeError('old'));
    mockWrites.mockClear();
    mockFailures.add(failure);
    const logs = loadLogs();
    logs.recordDiagnosticError(new ReferenceError('new while read failed'));
    expect(mockWrites).not.toHaveBeenCalled();
    expect(logs.readDiagnosticLogs()).toMatchObject({
      persistenceAvailable: false,
      entries: expect.arrayContaining([
        expect.objectContaining({ errorType: 'ReferenceError' }),
      ]),
    });
    mockFailures.delete(failure);
    logs.recordDiagnosticError(new SyntaxError('new after recovery'));
    expect(mockWrites).toHaveBeenCalledTimes(1);
    const restarted = loadLogs().readDiagnosticLogs();
    expect(restarted.persistenceAvailable).toBe(true);
    expect(restarted.entries.map((entry) => entry.errorType)).toEqual([
      ...Array.from({ length: 6 }, () => 'TypeError'),
      'ReferenceError',
      'SyntaxError',
    ]);
    expect(JSON.parse(mockWrites.mock.calls[0][0]).revision).toBe(7);
  },
);

test('opening logs after storage recovers persists pending records without needing another error', () => {
  const previousRun = loadLogs();
  previousRun.recordDiagnosticError(new TypeError('old'));
  mockFailures.add('read');
  const logs = loadLogs();
  logs.recordDiagnosticError(new ReferenceError('pending'));
  mockFailures.delete('read');
  expect(
    logs.readDiagnosticLogs().entries.map((entry) => entry.errorType),
  ).toEqual(['TypeError', 'ReferenceError']);
  expect(
    loadLogs()
      .readDiagnosticLogs()
      .entries.map((entry) => entry.errorType),
  ).toEqual(['TypeError', 'ReferenceError']);
});

test('clears both snapshots across restarts and reports a failed persistent clear', () => {
  const logs = loadLogs();
  logs.recordDiagnosticError(new Error('one'));
  logs.recordDiagnosticError(new Error('two'));
  mockFailures.add('delete');
  expect(logs.clearDiagnosticLogs()).toBe(false);
  expect(logs.readDiagnosticLogs()).toEqual({
    entries: [],
    persistenceAvailable: false,
  });
  mockFailures.delete('delete');
  expect(logs.clearDiagnosticLogs()).toBe(true);
  expect(loadLogs().readDiagnosticLogs().entries).toEqual([]);
});

test('missing filesystem and hostile error getters cannot throw or recurse', () => {
  const logs = loadLogs();
  mockFailures.add('construct');
  const error = new Error('private');
  Object.defineProperty(error, 'stack', {
    get() {
      throw new Error('getter failure');
    },
  });
  expect(() => logs.recordDiagnosticError(error)).not.toThrow();
  expect(logs.readDiagnosticLogs()).toMatchObject({
    entries: [{ errorType: 'Error', message: 'Application failure' }],
    persistenceAvailable: false,
  });
  expect(logs.formatDiagnosticLogsForExport()).toContain('受限');
  expect(() =>
    logs.recordDiagnosticError('synthetic-private-string'),
  ).not.toThrow();
  expect(logs.formatDiagnosticLogsForExport()).not.toContain(
    'synthetic-private-string',
  );
});
