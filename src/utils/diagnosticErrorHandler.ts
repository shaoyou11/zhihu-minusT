type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtils {
  getGlobalHandler?: () => ErrorHandler | undefined;
  setGlobalHandler: (handler: ErrorHandler) => void;
}

/** Record locally before delegating to Sentry / React Native's fatal handler. */
export function installDiagnosticErrorHandler(
  record: (error: unknown) => void,
  errorUtils: ErrorUtils | undefined = (
    globalThis as typeof globalThis & { ErrorUtils?: ErrorUtils }
  ).ErrorUtils,
): boolean {
  const previous = errorUtils?.getGlobalHandler?.();
  if (!errorUtils || !previous) return false;
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      record(error);
    } catch {
      // Diagnostics must never prevent the existing crash reporting / handling.
    }
    previous(error, isFatal);
  });
  return true;
}
