import type { DiagnosticContext } from './errorDiagnostics';

const errorContexts = new WeakMap<object, DiagnosticContext>();

function isWeakKey(error: unknown): error is object {
  return (
    (typeof error === 'object' && error !== null) || typeof error === 'function'
  );
}

/** Keep the innermost fixed business context without changing the exception. */
export function rememberDiagnosticContext(
  error: unknown,
  context: DiagnosticContext,
): void {
  if (isWeakKey(error) && !errorContexts.has(error)) {
    errorContexts.set(error, context);
  }
}

export function getDiagnosticContext(
  error: unknown,
): DiagnosticContext | undefined {
  return isWeakKey(error) ? errorContexts.get(error) : undefined;
}
