import type { Analytics, EventParams } from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';
import axios from 'axios';
import Constants from 'expo-constants';
import {
  getDiagnosticContext,
  rememberDiagnosticContext,
} from './diagnosticContext';
import { installDiagnosticErrorHandler } from './diagnosticErrorHandler';
import {
  type DiagnosticLogSource,
  recordDiagnosticError,
  recordDiagnosticEvent,
} from './diagnosticLogs';
import { classifyDiagnosticMessage } from './errorDiagnostics';
import { loadFirebaseAnalytics } from './firebaseAnalytics';
import { classifyNetworkError } from './networkFailure';
import { getTelemetryBuildContext } from './telemetryBuildContext';
import {
  getSentryBuildIdentity,
  sanitizeSentryEvent,
} from './telemetrySanitizer';

interface AppExtra {
  firebaseAnalyticsEnabled?: unknown;
  sentryDsn?: unknown;
}

const appExtra = Constants.expoConfig?.extra as AppExtra | undefined;
const sentryDsnFromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const sentryDsn =
  sentryDsnFromEnv ||
  (typeof appExtra?.sentryDsn === 'string' ? appExtra.sentryDsn : undefined);
const firebaseAnalyticsConfigured =
  process.env.EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED === 'true' ||
  appExtra?.firebaseAnalyticsEnabled === true;

let telemetryEnabled = false;
let telemetryPreferenceResolved = false;
type PendingStartupReport =
  | { type: 'error'; error: Error }
  | { type: 'event'; event: Sentry.Event };
type SentryEventHint = Parameters<
  NonNullable<Sentry.ReactNativeOptions['beforeSend']>
>[1];
interface CapturePrivacy {
  generation: number;
  allowed: boolean;
  locallyRecorded: boolean;
  startupReplay: boolean;
}
const pendingStartupReports: PendingStartupReport[] = [];
let privacyGeneration = 0;
// SDK processing may be asynchronous. Keep capture-time policy out of the
// serialized event while retaining it across the SDK's shallow hint copies.
const capturePrivacy = new WeakMap<object, CapturePrivacy>();
let sentryInitialized = false;
let firebaseAnalyticsPromise: Promise<Analytics | null> | null = null;
let telemetryVersion = 0;
let collectionUpdateChain: Promise<void> = Promise.resolve();
let diagnosticHandlerInstalled = false;
const locallyRecordedErrors = new WeakSet<object>();

const buildContext = getTelemetryBuildContext();

function createCapturePrivacy(): CapturePrivacy {
  return {
    generation: privacyGeneration,
    allowed: !telemetryPreferenceResolved || telemetryEnabled,
    locallyRecorded: false,
    startupReplay: false,
  };
}

function getCapturePrivacy(hint: SentryEventHint): CapturePrivacy {
  const data = hint.data ?? {};
  hint.data = data;
  const originalPrivacy =
    hint.originalException instanceof Object
      ? capturePrivacy.get(hint.originalException)
      : undefined;
  const privacy =
    capturePrivacy.get(data) ?? originalPrivacy ?? createCapturePrivacy();
  capturePrivacy.set(data, privacy);
  return privacy;
}

function recordedCaptureHint(startupReplay = false): SentryEventHint {
  const hint: SentryEventHint = {};
  const privacy = getCapturePrivacy(hint);
  privacy.locallyRecorded = true;
  privacy.startupReplay = startupReplay;
  return hint;
}

function queueStartupReport(report: PendingStartupReport): void {
  pendingStartupReports.push(report);
  if (pendingStartupReports.length > 10) pendingStartupReports.shift();
}

function sanitizeTelemetryEvent<T extends Sentry.Event>(
  event: T,
  hint: SentryEventHint,
): T | null {
  // Attachments live outside Event and would bypass the field whitelist.
  hint.attachments = [];
  const diagnostic = getDiagnosticContext(hint.originalException);
  if (diagnostic) {
    event.contexts = { ...event.contexts, diagnostic: { ...diagnostic } };
  }
  const privacy = getCapturePrivacy(hint);
  const isError = event.type === undefined && event.exception?.values?.length;
  if (
    isError &&
    !privacy.locallyRecorded &&
    !(
      hint.originalException instanceof Object &&
      locallyRecordedErrors.has(hint.originalException)
    )
  ) {
    const isRejection = event.exception?.values?.some(
      (exception) => exception.mechanism?.type === 'onunhandledrejection',
    );
    recordDiagnosticEvent(
      event,
      isRejection ? 'unhandled-rejection' : 'javascript',
    );
    privacy.locallyRecorded = true;
  }
  if (!privacy.allowed || privacy.generation !== privacyGeneration) return null;
  if (!telemetryPreferenceResolved) {
    // Never retain the original SDK event, hints, attachments, or user fields.
    const safe = isError ? sanitizeSentryEvent(event, buildContext) : null;
    if (safe) queueStartupReport({ type: 'event', event: safe });
    return null;
  }
  if (!telemetryEnabled) return null;
  return sanitizeSentryEvent(event, buildContext);
}

function initializeSentry() {
  if (!sentryDsn || sentryInitialized) return;

  Sentry.init({
    dsn: sentryDsn,
    debug: false,
    // Native crashes bypass JS beforeSend and opt-out. Keep automatic JS
    // errors, but do not initialize a separate unfiltered native transport.
    enableNative: false,
    ...getSentryBuildIdentity(buildContext),
    environment: buildContext.environment,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoPerformanceTracing: false,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableAutoSessionTracking: false,
    integrations: (defaults) => [
      ...defaults.map((integration) => {
        if (integration.name !== 'Dedupe' || !integration.processEvent)
          return integration;
        const processEvent = integration.processEvent.bind(integration);
        return {
          ...integration,
          processEvent: (...args: Parameters<typeof processEvent>) =>
            getCapturePrivacy(args[1]).startupReplay
              ? args[0]
              : processEvent(...args),
        };
      }),
      {
        name: 'TelemetryPrivacy',
        preprocessEvent: (_event, hint) => {
          if (hint) getCapturePrivacy(hint);
        },
      },
    ],
    beforeSend: sanitizeTelemetryEvent,
    beforeSendTransaction: sanitizeTelemetryEvent,
  });

  sentryInitialized = true;
}

async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!firebaseAnalyticsConfigured) return null;
  if (firebaseAnalyticsPromise) return firebaseAnalyticsPromise;

  firebaseAnalyticsPromise = loadFirebaseAnalytics();

  return firebaseAnalyticsPromise;
}

export function initializeTelemetry() {
  initializeSentry();
  // Install outside Sentry's handler so fatal JS errors reach disk before its
  // asynchronous flush or the platform's default fatal handler can terminate us.
  if (!diagnosticHandlerInstalled) {
    diagnosticHandlerInstalled = installDiagnosticErrorHandler((error) => {
      recordDiagnosticError(error, 'javascript');
      if (error instanceof Object) {
        locallyRecordedErrors.add(error);
        // Sentry's global handler awaits eventFromException before preprocessing.
        const privacy = createCapturePrivacy();
        privacy.locallyRecorded = true;
        capturePrivacy.set(error, privacy);
      }
    });
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  // An opt-out permanently invalidates pending captures, including those whose
  // asynchronous SDK processors finish only after telemetry is enabled again.
  if (!enabled) privacyGeneration += 1;
  telemetryEnabled = enabled;
  telemetryPreferenceResolved = true;
  telemetryVersion += 1;

  // Root rendering can fail before persisted privacy preferences finish loading.
  // Keep only bounded, sanitized in-memory errors until the preference is known.
  const startupReports = pendingStartupReports.splice(0);
  if (enabled) {
    for (const report of startupReports) {
      if (report.type === 'error') sendSentryError(report.error);
      else sendSentryEvent(report.event);
    }
  }

  if (!enabled) {
    Sentry.setUser(null);
  }

  // Serialize native changes so an earlier, slower enable cannot win over a
  // later opt-out. Resolve the desired value when each queued update starts.
  collectionUpdateChain = collectionUpdateChain.then(async () => {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics.setAnalyticsCollectionEnabled(telemetryEnabled);
    } catch {
      // Missing or invalid native Firebase configuration must not affect startup.
    }
  });
  await collectionUpdateChain;
}

export async function logTelemetryEvent(
  name: string,
  params?: EventParams,
): Promise<void> {
  if (!telemetryEnabled) return;
  const version = telemetryVersion;

  const analytics = await getFirebaseAnalytics();
  if (!analytics || !telemetryEnabled || version !== telemetryVersion) return;

  try {
    await analytics.logEvent(name, params);
  } catch {
    // Telemetry failures are deliberately isolated from product behavior.
  }
}

export function captureTelemetryException(
  error: unknown,
  source: DiagnosticLogSource = 'handled',
): void {
  recordDiagnosticError(error, source);
  // Axios errors carry config/request objects containing the complete session.
  // Send a new error with a fixed category instead of forwarding that object.
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const message = axios.isAxiosError(error)
    ? status === undefined
      ? `Network failure: ${classifyNetworkError(error, axios.isCancel(error))}`
      : `HTTP failure: ${status}`
    : classifyDiagnosticMessage(
        error instanceof Error ? error.message : undefined,
      ).summary;
  const safeError = new Error(message);
  const diagnostic = getDiagnosticContext(error);
  if (diagnostic) rememberDiagnosticContext(safeError, diagnostic);
  if (error instanceof Error) {
    const knownNames = [
      'Error',
      'TypeError',
      'RangeError',
      'ReferenceError',
      'SyntaxError',
      'URIError',
      'EvalError',
      'AxiosError',
      'AggregateError',
    ];
    if (knownNames.includes(error.name)) safeError.name = error.name;
    // Preserve symbolication frames without retaining the exception message
    // or query/fragment data in bundle URLs.
    const frames = error.stack
      ?.split('\n')
      .slice(1)
      .filter((line) => /^\s*at\s|^[\w$.[\]<>]*@/.test(line))
      .map((line) =>
        line.replace(
          /\b(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g,
          (match, url: string) => {
            const location = match.match(/(:\d+(?::\d+)?)$/)?.[1] ?? '';
            return `${url}${location}`;
          },
        ),
      );
    if (frames?.length)
      safeError.stack = `${safeError.name}: ${message}\n${frames.join('\n')}`;
  }
  if (!telemetryPreferenceResolved) {
    queueStartupReport({ type: 'error', error: safeError });
    return;
  }
  if (telemetryEnabled) sendSentryError(safeError);
}

function sendSentryError(error: Error): void {
  locallyRecordedErrors.add(error);
  try {
    Sentry.captureException(error, recordedCaptureHint());
  } catch {
    // The local diagnostic already exists; telemetry must not break recovery.
  }
}

function sendSentryEvent(event: Sentry.Event): void {
  try {
    // Dedupe may already have seen the original before beforeSend queued it.
    Sentry.captureEvent(event, recordedCaptureHint(true));
  } catch {
    // Replay has already been recorded locally and must not affect startup.
  }
}

export function isTelemetryConfigured(): boolean {
  return Boolean(sentryDsn || firebaseAnalyticsConfigured);
}

initializeTelemetry();
