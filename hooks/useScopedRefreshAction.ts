import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Coalesce pulls per query without letting an old account hold the new one. */
export function useScopedRefreshAction(
  scope: object,
  action: () => Promise<unknown>,
  onStateChange?: (refreshing: boolean) => void,
) {
  const [refreshingScope, setRefreshingScope] = useState<object | null>(null);
  const pending = useRef<{
    scope: object;
    request: Promise<void>;
    start: () => void;
    finish: () => void;
    cancelBeforeStart: () => void;
    started: boolean;
  } | null>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const task = pending.current;
      if (!task?.started) task?.cancelBeforeStart();
      task?.finish();
    };
  }, []);
  useLayoutEffect(() => {
    const task = pending.current;
    if (!task) return;
    if (task.scope !== scope) {
      if (!task.started) task.cancelBeforeStart();
      task.finish();
      return;
    }
    if (task.started || refreshingScope !== task.scope) return;
    // Commit refreshing=true to the native pull control before even an offline
    // or cached request can finish. This replaces a fixed spinner hold timer.
    task.started = true;
    task.start();
  }, [refreshingScope, scope]);

  const isRefreshingNow = useCallback(
    () => pending.current?.scope === scope,
    [scope],
  );
  const refresh = useCallback(() => {
    if (pending.current?.scope === scope) return pending.current.request;
    if (!pending.current?.started) {
      pending.current?.cancelBeforeStart();
      pending.current?.finish();
    }
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const request = new Promise<void>((resolveRequest, rejectRequest) => {
      resolve = resolveRequest;
      reject = rejectRequest;
    });
    const finish = () => {
      if (pending.current?.request !== request) return;
      pending.current = null;
      if (mounted.current) setRefreshingScope(null);
      onStateChange?.(false);
    };
    pending.current = {
      scope,
      request,
      started: false,
      cancelBeforeStart: resolve,
      finish,
      start: () => {
        void Promise.resolve()
          .then(action)
          .finally(finish)
          .then(() => resolve(), reject);
      },
    };
    setRefreshingScope(scope);
    onStateChange?.(true);
    return request;
  }, [action, onStateChange, scope]);

  return {
    refresh,
    refreshing: refreshingScope === scope,
    isRefreshingNow,
  };
}
