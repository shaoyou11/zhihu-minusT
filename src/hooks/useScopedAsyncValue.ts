import { useCallback, useEffect, useRef, useState } from 'react';

/** Hide an old account's value immediately while the new scope is loading. */
export function useScopedAsyncValue<TScope extends object, TValue>(
  scope: TScope | null,
  load: (scope: TScope) => Promise<TValue>,
) {
  const [snapshot, setSnapshot] = useState<{
    scope: TScope;
    value: TValue | null;
  } | null>(null);
  const currentScopeRef = useRef(scope);
  currentScopeRef.current = scope;

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    void load(scope)
      .then((value) => {
        if (!cancelled) setSnapshot({ scope, value });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ scope, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, load]);

  const setValue = useCallback(
    (value: TValue) => {
      // A refresh that started under another account cannot replace this scope.
      if (scope && currentScopeRef.current === scope)
        setSnapshot({ scope, value });
    },
    [scope],
  );

  return {
    value: scope && snapshot?.scope === scope ? snapshot.value : null,
    ready: !scope || snapshot?.scope === scope,
    setValue,
  };
}
