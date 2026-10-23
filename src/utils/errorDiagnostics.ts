export type DiagnosticErrorCode =
  | 'js.undefined-property'
  | 'js.null-property'
  | 'js.not-a-function'
  | 'js.invalid-object'
  | 'js.stack-overflow'
  | 'react.hook-order'
  | 'react.update-depth'
  | 'http.failure'
  | 'network.failure'
  | 'application.unknown';

export interface DiagnosticMessage {
  code: DiagnosticErrorCode;
  summary: string;
}

export interface DiagnosticContext {
  area?:
    | 'application'
    | 'following'
    | 'following.recent-moments'
    | 'user.recent-posts'
    | 'settings.diagnostics';
  operation?: 'render' | 'swipe' | 'load' | 'refresh' | 'copy-logs' | 'startup';
}

const AREAS = new Set<NonNullable<DiagnosticContext['area']>>([
  'application',
  'following',
  'following.recent-moments',
  'user.recent-posts',
  'settings.diagnostics',
]);
const OPERATIONS = new Set<NonNullable<DiagnosticContext['operation']>>([
  'render',
  'swipe',
  'load',
  'refresh',
  'copy-logs',
  'startup',
]);
// Properties can themselves be private values. Keep only fixed structural names.
const SAFE_PROPERTIES = new Set([
  'length',
  'data',
  'items',
  'actor',
  'id',
  'avatar_url',
  'url_token',
  'unread_count',
  'map',
  'filter',
  'forEach',
  'reduce',
  'slice',
  'concat',
  'find',
  'findIndex',
  'some',
  'every',
  'includes',
  'indexOf',
  'join',
  'sort',
  'reverse',
  'flat',
  'flatMap',
  'push',
  'pop',
  'shift',
  'unshift',
  'trim',
  'split',
  'replace',
  'toLowerCase',
  'toUpperCase',
  'toString',
  'then',
  'catch',
  'finally',
]);

function propertyName(value: string): string {
  return SAFE_PROPERTIES.has(value) ? value : '<redacted>';
}

function propertyFailure(
  receiver: 'undefined' | 'null',
  property: string,
): DiagnosticMessage {
  return {
    code:
      receiver === 'undefined' ? 'js.undefined-property' : 'js.null-property',
    summary: `Cannot read property '${propertyName(property)}' of ${receiver}`,
  };
}

/** Classify engine errors without copying arbitrary error messages or values. */
export function classifyDiagnosticMessage(value: unknown): DiagnosticMessage {
  const unknown: DiagnosticMessage = {
    code: 'application.unknown',
    summary: 'Application failure',
  };
  if (typeof value !== 'string' || value.length > 4096) return unknown;
  if (/^HTTP failure: [1-5]\d{2}$/.test(value))
    return { code: 'http.failure', summary: value };
  if (
    /^Network failure: (?:canceled|timeout|offline|dns-error|tls-error|connection-reset|connection-refused|connection-error|network-error)$/.test(
      value,
    )
  )
    return { code: 'network.failure', summary: value };

  const v8 = value.match(
    /^Cannot read properties of (undefined|null) \(reading ['"]([^'"\r\n]*)['"]\)\.?$/,
  );
  if (v8) return propertyFailure(v8[1] as 'undefined' | 'null', v8[2]);
  const hermes = value.match(
    /^Cannot read property ['"]([^'"\r\n]*)['"] of (undefined|null)\.?$/,
  );
  if (hermes)
    return propertyFailure(hermes[2] as 'undefined' | 'null', hermes[1]);
  const jsc = value.match(
    /^(undefined|null) is not an object \(evaluating ['"]([^\r\n]*)['"]\)\.?$/,
  );
  if (jsc) {
    // Keep only the final structural property, never the evaluated expression.
    const property = jsc[2].match(/\.([a-zA-Z_$][\w$]*)$/)?.[1] ?? '';
    return propertyFailure(jsc[1] as 'undefined' | 'null', property);
  }
  const notFunction = value.match(
    /^(?:Property ['"]([^'"\r\n]*)['"]|[^\r\n]+\.([a-zA-Z_$][\w$]*)) is not a function(?: \(it is (?:undefined|null)\))?\.?$/,
  );
  if (notFunction) {
    return {
      code: 'js.not-a-function',
      summary: `Property '${propertyName(notFunction[1] ?? notFunction[2])}' is not a function`,
    };
  }
  if (/^(?:undefined|null) is not a function\.?$/.test(value))
    return { code: 'js.not-a-function', summary: 'Value is not a function' };
  if (value === 'Value is not a function')
    return { code: 'js.not-a-function', summary: value };
  if (
    /^Cannot convert (?:undefined(?: or null)?|null)(?: value)? to object\.?$/.test(
      value,
    )
  )
    return {
      code: 'js.invalid-object',
      summary: 'Cannot convert undefined or null to object',
    };
  if (/^Maximum call stack size exceeded\.?$/.test(value))
    return {
      code: 'js.stack-overflow',
      summary: 'Maximum call stack size exceeded',
    };
  if (
    /^Rendered (?:fewer|more) hooks than (?:expected|during the previous render)[.!]/.test(
      value,
    ) ||
    value === 'React hook order changed'
  )
    return { code: 'react.hook-order', summary: 'React hook order changed' };
  if (/^Maximum update depth exceeded(?:\.|$)/.test(value))
    return {
      code: 'react.update-depth',
      summary: 'Maximum update depth exceeded',
    };
  return unknown;
}

/** Context is supplied by fixed call sites, never by a pathname or account. */
export function sanitizeDiagnosticContext(
  value: unknown,
): DiagnosticContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const area = AREAS.has(record.area as NonNullable<DiagnosticContext['area']>)
    ? (record.area as DiagnosticContext['area'])
    : undefined;
  const operation = OPERATIONS.has(
    record.operation as NonNullable<DiagnosticContext['operation']>,
  )
    ? (record.operation as DiagnosticContext['operation'])
    : undefined;
  if (!area && !operation) return undefined;
  return {
    ...(area ? { area } : {}),
    ...(operation ? { operation } : {}),
  };
}

const BUNDLE_FILENAMES = new Set([
  'index.bundle',
  'index.android.bundle',
  'index.ios.bundle',
  'main.jsbundle',
  'entry.bundle',
  'index.js',
]);

/** Match a build-time source allowlist, removing all host and query data. */
export function sanitizeCodeFilename(
  value: unknown,
  sourceFiles: readonly string[] = [],
): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  // Metro's JSC-safe URLs encode '?' as '//&', including on Hermes/iOS.
  let path = value.split(/\/{2}&|[?#]/, 1)[0].replace(/\\/g, '/');
  try {
    path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (path.split('/').includes('..')) return undefined;
  const source = sourceFiles.find(
    (candidate) =>
      /^(?:[\w()[\]+.-]+\/)*[\w()[\]+.-]+\.(?:js|mjs|cjs|jsx|ts|tsx)$/.test(
        candidate,
      ) &&
      !candidate.split('/').some((part) => part === '.' || part === '..') &&
      (path === candidate || path.endsWith(`/${candidate}`)),
  );
  if (source) return source;
  const basename = path.slice(path.lastIndexOf('/') + 1);
  if (
    basename === '.virtual-metro-entry' ||
    basename === '.virtual-metro-entry.bundle'
  )
    return 'entry.bundle';
  if (
    basename.length > 128 ||
    !/^[\w.-]+\.(?:js|mjs|cjs|jsx|ts|tsx|bundle|jsbundle|hbc)$/.test(basename)
  )
    return undefined;
  if (!BUNDLE_FILENAMES.has(basename)) return 'source.js';
  return path.startsWith('app:///') ? `app:///${basename}` : basename;
}
