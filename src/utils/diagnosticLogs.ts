import type { Event, StackFrame } from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';
import { getDiagnosticContext } from './diagnosticContext';
import {
  classifyDiagnosticMessage,
  type DiagnosticContext,
  type DiagnosticErrorCode,
  sanitizeDiagnosticContext,
} from './errorDiagnostics';
import { getTelemetryBuildContext } from './telemetryBuildContext';
import {
  sanitizeSentryEvent,
  type TelemetryBuildContext,
} from './telemetrySanitizer';

export type DiagnosticLogSource =
  | 'react-render'
  | 'javascript'
  | 'unhandled-rejection'
  | 'handled';

export interface DiagnosticLogEntry {
  timestamp: string;
  source: DiagnosticLogSource;
  errorType: string;
  errorCode: DiagnosticErrorCode;
  message: string;
  context?: DiagnosticContext;
  frames: {
    filename?: string;
    lineno?: number;
    colno?: number;
    debug_id?: string;
  }[];
  appVersion?: string;
  buildNumber?: string;
  commit?: string;
  sourceFingerprint?: string;
  osVersion?: string;
  platform: TelemetryBuildContext['platform'];
  environment: TelemetryBuildContext['environment'];
}

export interface DiagnosticLogSnapshot {
  entries: DiagnosticLogEntry[];
  persistenceAvailable: boolean;
}

const MAX_ENTRIES = 30;
const MAX_FRAMES = 12;
const MAX_FILE_BYTES = 64 * 1024;
const FILE_NAMES = [
  'diagnostic-errors-0.json',
  'diagnostic-errors-1.json',
] as const;
const SOURCES = new Set<DiagnosticLogSource>([
  'react-render',
  'javascript',
  'unhandled-rejection',
  'handled',
]);
let entries: DiagnosticLogEntry[] = [];
let pendingEntries: DiagnosticLogEntry[] = [];
let diskRevisionKnown = false;
let ignorePersistedEntries = false;
let persistenceAvailable = true;
let revision = 0;
let recording = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeVersion(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d+(?:[._-]\d+){0,4}$/.test(value) &&
    value.length < 40
    ? value
    : undefined;
}

function normalizeSource(value: unknown): DiagnosticLogSource {
  return typeof value === 'string' && SOURCES.has(value as DiagnosticLogSource)
    ? (value as DiagnosticLogSource)
    : 'handled';
}

function entryFromEvent(
  event: Event,
  source: unknown,
  build: TelemetryBuildContext,
  timestamp: string,
): DiagnosticLogEntry | null {
  const safe = sanitizeSentryEvent(event, build);
  const exception = safe?.exception?.values?.[0];
  if (!exception) return null;
  return {
    timestamp,
    source: normalizeSource(source),
    errorType: exception.type ?? 'Error',
    errorCode: classifyDiagnosticMessage(exception.value).code,
    message: exception.value ?? 'Application failure',
    context: sanitizeDiagnosticContext(safe?.contexts?.diagnostic),
    frames: (exception.stacktrace?.frames ?? [])
      .slice(-MAX_FRAMES)
      .map((frame) => ({
        filename: frame.filename,
        lineno: frame.lineno,
        colno: frame.colno,
        debug_id: frame.debug_id,
      })),
    appVersion: safe?.contexts?.app?.app_version,
    buildNumber: safeVersion(safe?.contexts?.app?.app_build),
    commit:
      typeof safe?.tags?.commit === 'string' ? safe.tags.commit : undefined,
    sourceFingerprint:
      typeof safe?.tags?.source_fingerprint === 'string'
        ? safe.tags.source_fingerprint
        : undefined,
    osVersion: safe?.contexts?.os?.version,
    platform: build.platform,
    environment: build.environment,
  };
}

function normalizeEntry(value: unknown): DiagnosticLogEntry | null {
  if (
    !isRecord(value) ||
    typeof value.timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.timestamp) ||
    !Number.isFinite(Date.parse(value.timestamp))
  )
    return null;
  const frames: StackFrame[] = Array.isArray(value.frames)
    ? value.frames
        .slice(-MAX_FRAMES)
        .filter(isRecord)
        .map((frame) => ({
          filename:
            typeof frame.filename === 'string' ? frame.filename : undefined,
          lineno: typeof frame.lineno === 'number' ? frame.lineno : undefined,
          colno: typeof frame.colno === 'number' ? frame.colno : undefined,
          debug_id:
            typeof frame.debug_id === 'string' ? frame.debug_id : undefined,
        }))
    : [];
  return entryFromEvent(
    {
      contexts: { diagnostic: { ...sanitizeDiagnosticContext(value.context) } },
      exception: {
        values: [
          {
            type:
              typeof value.errorType === 'string' ? value.errorType : undefined,
            value:
              typeof value.message === 'string' ? value.message : undefined,
            stacktrace: { frames },
          },
        ],
      },
    },
    value.source,
    {
      appVersion: safeVersion(value.appVersion),
      buildNumber: safeVersion(value.buildNumber),
      commit: typeof value.commit === 'string' ? value.commit : undefined,
      sourceFingerprint:
        typeof value.sourceFingerprint === 'string'
          ? value.sourceFingerprint
          : undefined,
      sourceFiles: getTelemetryBuildContext().sourceFiles,
      osVersion: safeVersion(value.osVersion),
      platform:
        value.platform === 'ios' || value.platform === 'android'
          ? value.platform
          : 'other',
      environment:
        value.environment === 'production' ? 'production' : 'development',
    },
    value.timestamp,
  );
}

function normalizeEntries(value: unknown): DiagnosticLogEntry[] {
  return Array.isArray(value)
    ? value
        .slice(-MAX_ENTRIES)
        .map(normalizeEntry)
        .filter((entry) => entry !== null)
    : [];
}

function ensureLoaded(): void {
  if (diskRevisionKnown) return;
  let latestRevision = 0;
  let storedEntries: DiagnosticLogEntry[] = [];
  let readFailed = false;
  for (const name of FILE_NAMES) {
    try {
      const file = new File(Paths.document, name);
      if (!file.exists || file.size > MAX_FILE_BYTES) continue;
      const raw = file.textSync();
      if (raw.length > MAX_FILE_BYTES) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // A torn write must not prevent recovery from the other snapshot.
        continue;
      }
      if (
        !isRecord(parsed) ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.entries) ||
        typeof parsed.revision !== 'number' ||
        !Number.isSafeInteger(parsed.revision) ||
        parsed.revision >= Number.MAX_SAFE_INTEGER ||
        parsed.revision < latestRevision
      )
        continue;
      latestRevision = parsed.revision;
      storedEntries = normalizeEntries(parsed.entries);
    } catch {
      readFailed = true;
    }
  }
  entries = [
    ...(ignorePersistedEntries ? [] : storedEntries),
    ...pendingEntries,
  ].slice(-MAX_ENTRIES);
  // An unreadable slot may contain a newer revision. Preserve pending records
  // in memory until both slots can be read before assigning a new revision.
  diskRevisionKnown = !readFailed;
  persistenceAvailable = !readFailed && !ignorePersistedEntries;
  if (!readFailed) revision = latestRevision;
}

function persist(): void {
  if (!diskRevisionKnown) return;
  try {
    revision += 1;
    const file = new File(
      Paths.document,
      FILE_NAMES[revision % FILE_NAMES.length],
    );
    let payload = JSON.stringify({ version: 1, revision, entries });
    // Persisted fields contain ASCII only, so this also bounds UTF-8 bytes.
    while (payload.length > MAX_FILE_BYTES && entries.length > 0) {
      entries = entries.slice(1);
      payload = JSON.stringify({ version: 1, revision, entries });
    }
    // Alternate bounded snapshots so interruption never destroys both copies.
    file.writeSync(payload);
    pendingEntries = [];
    persistenceAvailable = !ignorePersistedEntries;
  } catch {
    persistenceAvailable = false;
    // Never report storage errors through the error recorder itself.
  }
}

/** Local recording is independent of telemetry consent and never sends data. */
export function recordDiagnosticEvent(
  event: Event,
  source: DiagnosticLogSource = 'handled',
): void {
  if (recording) return;
  recording = true;
  try {
    ensureLoaded();
    const entry = entryFromEvent(
      event,
      source,
      getTelemetryBuildContext(),
      new Date().toISOString(),
    );
    if (!entry) return;
    entries = [...entries, entry].slice(-MAX_ENTRIES);
    pendingEntries = [...pendingEntries, entry].slice(-MAX_ENTRIES);
    // Synchronous persistence gives fatal JS errors a chance to survive restart.
    persist();
  } catch {
    // Hostile error getters or missing native modules must not cause another error.
  } finally {
    recording = false;
  }
}

/** Keep classified causes and code locations, never arbitrary error properties. */
export function recordDiagnosticError(
  error: unknown,
  source: DiagnosticLogSource = 'handled',
): void {
  try {
    const frames: StackFrame[] = [];
    if (error instanceof Error && typeof error.stack === 'string') {
      for (const line of error.stack
        .slice(0, 32 * 1024)
        .split('\n')
        .slice(1, 101)) {
        if (!/^\s*at\s|^[\w$.[\]<>]*@/.test(line)) continue;
        const location = line.match(/(?:\(|@|\s)([^\s()]+):(\d+):(\d+)\)?\s*$/);
        if (location)
          frames.push({
            filename: location[1],
            lineno: Number(location[2]),
            colno: Number(location[3]),
          });
      }
    }
    recordDiagnosticEvent(
      {
        contexts: { diagnostic: { ...getDiagnosticContext(error) } },
        exception: {
          values: [
            {
              type: error instanceof Error ? error.name : 'Error',
              value: error instanceof Error ? error.message : undefined,
              // Sentry frame ordering is oldest to newest; retain the failing frames.
              stacktrace: { frames: frames.slice(0, MAX_FRAMES).reverse() },
            },
          ],
        },
      },
      source,
    );
  } catch {
    recordDiagnosticEvent(
      {
        exception: {
          values: [{ type: 'Error', value: 'Application failure' }],
        },
      },
      source,
    );
  }
}

export function readDiagnosticLogs(): DiagnosticLogSnapshot {
  ensureLoaded();
  if (pendingEntries.length > 0) persist();
  return { entries: normalizeEntries(entries), persistenceAvailable };
}

export function clearDiagnosticLogs(): boolean {
  ensureLoaded();
  entries = [];
  pendingEntries = [];
  let cleared = true;
  for (const name of FILE_NAMES) {
    try {
      const file = new File(Paths.document, name);
      if (file.exists) file.delete();
    } catch {
      cleared = false;
    }
  }
  // A failed clear must not resurrect old entries during a later read retry.
  ignorePersistedEntries = !cleared;
  diskRevisionKnown = cleared;
  if (cleared) revision = 0;
  persistenceAvailable = cleared;
  return cleared;
}

export function formatDiagnosticLogsForExport(
  snapshot: DiagnosticLogSnapshot = readDiagnosticLogs(),
): string {
  const build = getTelemetryBuildContext();
  const logs = normalizeEntries(snapshot.entries);
  const lines = [
    'Zhihu-- 脱敏错误日志',
    `当前版本: ${build.appVersion ?? '未知'} | 系统: ${build.platform} ${build.osVersion ?? '未知'} | ${build.environment}`,
    `构建: ${build.buildNumber ?? '未知'} | commit: ${build.commit ?? '未知'} | 源码指纹: ${build.sourceFingerprint ?? '未知'}`,
    `记录数: ${logs.length}/${MAX_ENTRIES}`,
    `本地保存: ${snapshot.persistenceAvailable ? '可用' : '受限，部分记录可能仅保留于本次运行'}`,
    '仅含脱敏错误原因、固定业务位置、构建标识和代码位置，不含账号、Cookie 或请求内容。',
    '原生进程退出、系统终止及未送达 JS 的错误可能没有记录。',
  ];
  for (const entry of [...logs].reverse()) {
    lines.push(
      '',
      `${entry.timestamp} [${entry.source}] ${entry.errorType}: ${entry.message}`,
      `错误码: ${entry.errorCode} | 位置: ${entry.context?.area ?? '未知'} / ${entry.context?.operation ?? '未知'}`,
      `版本: ${entry.appVersion ?? '未知'} | ${entry.platform} ${entry.osVersion ?? '未知'} | ${entry.environment}`,
      `构建: ${entry.buildNumber ?? '未知'} | commit: ${entry.commit ?? '未知'} | 源码指纹: ${entry.sourceFingerprint ?? '未知'}`,
    );
    for (const frame of [...entry.frames].reverse())
      lines.push(
        `  ${frame.filename ?? 'source.js'}:${frame.lineno ?? '?'}:${frame.colno ?? '?'}${frame.debug_id ? ` [debug_id=${frame.debug_id}]` : ''}`,
      );
  }
  return lines.join('\n');
}
