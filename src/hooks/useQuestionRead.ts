import { useEffect, useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { readContents } from '@/api/zhihu/lastRead';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useActiveScreen } from './useActiveScreen';

/** Report entry to a loaded question, independently of local history settings. */
export function useQuestionRead(
  questionId: string,
  sessionVersion: number,
  ready: boolean,
): void {
  const active = useActiveScreen();
  const authenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const recorded = useMemo(
    () => ({ sessionVersion, ids: new Set<string>() }),
    [sessionVersion],
  );
  const id = questionId.trim();

  useEffect(() => {
    if (
      !ready ||
      !active ||
      !authenticated ||
      !id ||
      recorded.sessionVersion !== getAuthSessionVersion() ||
      recorded.ids.has(id)
    )
      return;

    recorded.ids.add(id);
    void readContents([{ type: 'question', id }], {
      sessionVersion: recorded.sessionVersion,
    }).catch(() => {
      // The reservation belongs to this session, even if an account changed.
      // Failure stays silent and permits another visit/focus opportunity.
      recorded.ids.delete(id);
    });
  }, [active, authenticated, id, ready, recorded]);
}
