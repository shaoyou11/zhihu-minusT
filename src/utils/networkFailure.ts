export type NetworkFailureStatus =
  | 'canceled'
  | 'timeout'
  | 'offline'
  | 'dns-error'
  | 'tls-error'
  | 'connection-reset'
  | 'connection-refused'
  | 'connection-error'
  | 'network-error';

interface NetworkFailureDetails {
  canceled?: boolean;
  code?: unknown;
  message?: unknown;
  nativeMessage?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reduce native transport errors to a safe category. The original native
 * message can contain a host, IP address, or proxy detail and must not be
 * written to application logs.
 */
export function classifyNetworkFailure({
  canceled,
  code,
  message,
  nativeMessage,
}: NetworkFailureDetails): NetworkFailureStatus {
  if (canceled) return 'canceled';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout';

  const detail = [message, nativeMessage]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (
    /internet connection appears to be offline|network is unreachable|not connected to (?:the )?internet|no network connection/.test(
      detail,
    )
  ) {
    return 'offline';
  }
  if (
    /unable to resolve host|could not resolve host|name or service not known|nodename nor servname|host(?:name)? (?:was )?not found|dns/.test(
      detail,
    )
  ) {
    return 'dns-error';
  }
  if (
    /ssl|tls|certificate|certpath|trust anchor|secure connection/.test(detail)
  ) {
    return 'tls-error';
  }
  if (
    /connection reset|socket closed|software caused connection abort|unexpected end of stream|broken pipe/.test(
      detail,
    )
  ) {
    return 'connection-reset';
  }
  if (/connection refused/.test(detail)) return 'connection-refused';
  if (
    /network connection was lost|failed to connect|connection closed/.test(
      detail,
    )
  ) {
    return 'connection-error';
  }
  return 'network-error';
}

/** Read only the fields needed for classification from an Axios/RN error. */
export function classifyNetworkError(
  error: unknown,
  canceled = false,
): NetworkFailureStatus {
  if (!isRecord(error)) return 'network-error';

  const request = error.request;
  const nativeMessage =
    isRecord(request) && '_response' in request ? request._response : undefined;
  return classifyNetworkFailure({
    canceled,
    code: error.code,
    message: error.message,
    nativeMessage,
  });
}
