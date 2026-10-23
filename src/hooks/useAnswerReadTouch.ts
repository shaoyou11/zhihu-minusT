import { useEffect, useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { touchAnswerRead } from '@/api/zhihu/lastRead';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useActiveScreen } from './useActiveScreen';

/** Callers supply only visible answer bodies, never prefetched answers or summaries. */
export function useAnswerReadTouch(
  answerIds: readonly string[],
  enabled = true,
): void {
  const active = useActiveScreen();
  const authenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const recorded = useMemo(
    () => ({ sessionVersion, ids: new Set<string>() }),
    [sessionVersion],
  );

  useEffect(() => {
    if (
      !enabled ||
      !active ||
      !authenticated ||
      recorded.sessionVersion !== getAuthSessionVersion()
    )
      return;

    for (const id of answerIds) {
      if (!id.trim() || recorded.ids.has(id)) continue;
      // Reserve before starting so rerenders cannot duplicate an in-flight touch.
      recorded.ids.add(id);
      void touchAnswerRead(id, {
        sessionVersion: recorded.sessionVersion,
      }).catch(() => {
        // Retry on a later reading opportunity, without blocking or notifying.
        // This set belongs to the old session even if the account has changed.
        recorded.ids.delete(id);
      });
    }
  }, [answerIds, enabled, active, authenticated, recorded]);
}
