import { useRef } from 'react';

/** Keep visible data through an exact query reset, never across account scopes. */
export function useRefreshSnapshot<T>(
  scope: object,
  data: T | undefined,
  refreshing: boolean,
  pendingOrFailed: boolean,
): T | undefined {
  const snapshot = useRef({ scope, data });
  if (snapshot.current.scope !== scope) {
    snapshot.current = { scope, data };
  } else if (!refreshing && !pendingOrFailed) {
    snapshot.current.data = data;
  }

  return refreshing || pendingOrFailed ? (snapshot.current.data ?? data) : data;
}
