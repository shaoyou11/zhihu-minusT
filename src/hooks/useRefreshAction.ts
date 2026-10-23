import { useCallback, useEffect, useRef, useState } from 'react';

/** A query reset enters initial loading; track the user's refresh independently. */
export function useRefreshAction(action: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setRefreshing(true);
    const request = Promise.resolve()
      .then(action)
      .then(() => undefined)
      .finally(() => {
        pending.current = null;
        if (mounted.current) setRefreshing(false);
      });
    pending.current = request;
    return request;
  }, [action]);

  return { refresh, refreshing };
}
