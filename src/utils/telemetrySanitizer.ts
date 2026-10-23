import type { Event, StackFrame } from '@sentry/react-native';
import {
  classifyDiagnosticMessage,
  sanitizeCodeFilename,
  sanitizeDiagnosticContext,
} from './errorDiagnostics';

export interface TelemetryBuildContext {
  appVersion?: string;
  applicationId?: string;
  buildNumber?: string;
  commit?: string;
  sourceFingerprint?: string;
  sourceFiles?: readonly string[];
  osVersion?: string | null;
  platform: 'ios' | 'android' | 'other';
  environment: 'development' | 'production';
}

const ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AxiosError',
  'AggregateError',
]);
const OPERATIONS = new Set([
  'http.client',
  'http.server',
  'navigation',
  'pageload',
  'ui.load',
  'ui.action',
  'app.start.cold',
  'app.start.warm',
]);
const STATUSES = new Set([
  'ok',
  'unknown_error',
  'internal_error',
  'cancelled',
  'deadline_exceeded',
  'resource_exhausted',
  'invalid_argument',
  'unavailable',
  'not_found',
  'permission_denied',
  'unauthenticated',
]);

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function hex(value: unknown, length: number): string | undefined {
  return typeof value === 'string' &&
    new RegExp(`^[a-fA-F0-9]{${length}}$`).test(value)
    ? value
    : undefined;
}

function uuid(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value)
    ? value
    : undefined;
}

function version(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length < 40 &&
    /^\d+(?:[._-]\d+){0,4}$/.test(value)
    ? value
    : undefined;
}

/** Match the native Sentry upload defaults without trusting SDK event metadata. */
export function getSentryBuildIdentity(build: TelemetryBuildContext): {
  release?: string;
  dist?: string;
} {
  const appVersion = version(build.appVersion);
  const dist = version(build.buildNumber);
  const applicationId =
    typeof build.applicationId === 'string' &&
    build.applicationId.length <= 255 &&
    /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(
      build.applicationId,
    )
      ? build.applicationId
      : undefined;
  return compact({
    release:
      applicationId && appVersion && dist
        ? `${applicationId}@${appVersion}+${dist}`
        : undefined,
    dist,
  });
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined {
  return typeof value === 'string' && allowed.has(value as T)
    ? (value as T)
    : undefined;
}

function sanitizeFrame(
  frame: StackFrame,
  sourceFiles?: readonly string[],
): StackFrame {
  const filename = sanitizeCodeFilename(
    frame.filename ?? frame.abs_path,
    sourceFiles,
  );
  // Function/module names, source context and vars may contain runtime values.
  return compact({
    filename,
    // Sentry associates Debug ID images by abs_path/code_file after processing.
    abs_path: sanitizeCodeFilename(frame.abs_path, sourceFiles) ?? filename,
    lineno: integer(frame.lineno),
    colno: integer(frame.colno),
    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
    debug_id: uuid(frame.debug_id),
  });
}

/** Rebuild the event instead of trying to blacklist arbitrary SDK additions. */
export function sanitizeSentryEvent<T extends Event>(
  event: T,
  build: TelemetryBuildContext,
): T | null {
  if (event.type !== undefined && event.type !== 'transaction') return null;
  const safe: Event = compact({
    type: event.type,
    event_id: hex(event.event_id, 32),
    timestamp: finite(event.timestamp),
    start_timestamp: finite(event.start_timestamp),
    level: enumValue(
      event.level,
      new Set(['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const),
    ),
    platform: 'javascript',
    ...getSentryBuildIdentity(build),
    environment: build.environment,
    tags: compact({
      app_version: version(build.appVersion),
      build_number: version(build.buildNumber),
      commit: hex(build.commit, 40),
      source_fingerprint: hex(build.sourceFingerprint, 24),
      platform: build.platform,
    }),
  });

  if (event.exception?.values) {
    safe.exception = {
      values: event.exception.values.slice(0, 8).map((exception) => {
        const mechanism = exception.mechanism;
        return compact({
          type: enumValue(exception.type, ERROR_TYPES) ?? 'Error',
          value: classifyDiagnosticMessage(exception.value).summary,
          stacktrace: exception.stacktrace?.frames
            ? {
                frames: exception.stacktrace.frames
                  .slice(-100)
                  .map((frame) => sanitizeFrame(frame, build.sourceFiles)),
              }
            : undefined,
          mechanism: mechanism
            ? compact({
                type:
                  enumValue(
                    mechanism.type,
                    new Set([
                      'generic',
                      'onerror',
                      'onunhandledrejection',
                      'instrument',
                      'auto.core.react',
                      'auto.react.errorboundary',
                    ]),
                  ) ?? 'generic',
                handled:
                  typeof mechanism.handled === 'boolean'
                    ? mechanism.handled
                    : undefined,
                synthetic:
                  typeof mechanism.synthetic === 'boolean'
                    ? mechanism.synthetic
                    : undefined,
              })
            : undefined,
        });
      }),
    };
  } else if (event.message || event.logentry) {
    safe.message = 'Application event';
  }
  if (safe.exception?.values?.[0]) {
    safe.tags = {
      ...safe.tags,
      error_code: classifyDiagnosticMessage(safe.exception.values[0].value)
        .code,
    };
  }

  const device = event.contexts?.device;
  safe.contexts = {
    app: compact({
      app_version: version(build.appVersion),
      app_build: version(build.buildNumber),
    }),
    os: compact({ name: build.platform, version: version(build.osVersion) }),
    device: compact({
      arch: enumValue(
        device?.arch,
        new Set(['arm', 'arm64', 'arm64-v8a', 'x86', 'x86_64']),
      ),
      orientation: enumValue(
        device?.orientation,
        new Set(['portrait', 'landscape'] as const),
      ),
      simulator:
        typeof device?.simulator === 'boolean' ? device.simulator : undefined,
      memory_size: finite(device?.memory_size),
      free_memory: finite(device?.free_memory),
      screen_height_pixels: integer(device?.screen_height_pixels),
      screen_width_pixels: integer(device?.screen_width_pixels),
    }),
  };
  const diagnostic = sanitizeDiagnosticContext(event.contexts?.diagnostic);
  if (diagnostic) safe.contexts.diagnostic = { ...diagnostic };
  const trace = event.contexts?.trace;
  const traceId = hex(trace?.trace_id, 32);
  const spanId = hex(trace?.span_id, 16);
  if (traceId && spanId) {
    safe.contexts.trace = compact({
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: hex(trace?.parent_span_id, 16),
      op: enumValue(trace?.op, OPERATIONS),
      status: enumValue(trace?.status, STATUSES),
    });
  }

  // Debug IDs preserve production source-map symbolication without full paths.
  const images = event.debug_meta?.images?.flatMap((image) => {
    const debugId = uuid(image.debug_id);
    const codeFile = sanitizeCodeFilename(image.code_file, build.sourceFiles);
    return image.type === 'sourcemap' && debugId && codeFile
      ? [{ type: 'sourcemap' as const, debug_id: debugId, code_file: codeFile }]
      : [];
  });
  if (images?.length) safe.debug_meta = { images: images.slice(0, 10) };
  if (event.type === 'transaction') {
    safe.transaction = 'Application transaction';
    safe.spans = event.spans?.slice(0, 100).flatMap((span) => {
      const spanTraceId = hex(span.trace_id, 32);
      const id = hex(span.span_id, 16);
      const start = finite(span.start_timestamp);
      if (!spanTraceId || !id || start === undefined) return [];
      return [
        compact({
          trace_id: spanTraceId,
          span_id: id,
          parent_span_id: hex(span.parent_span_id, 16),
          start_timestamp: start,
          timestamp: finite(span.timestamp),
          op: enumValue(span.op, OPERATIONS),
          status: enumValue(span.status, STATUSES),
          data: {},
        }),
      ];
    });
  }
  // The discriminator is retained; all returned fields are valid Event fields.
  return safe as T;
}
