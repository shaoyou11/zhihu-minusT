import { useEffect, useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { type ContentReadTarget, readContents } from '@/api/zhihu/lastRead';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useActiveScreen } from './useActiveScreen';

export interface AnswerReadSession {
  sessionVersion: number;
  scopeKey?: string;
  recorded: Set<string>;
}

/** Share one reading visit across all mounted pages, including preloaded pages. */
export function useAnswerReadSession(scopeKey?: string): AnswerReadSession {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  return useMemo(
    () => ({ sessionVersion, scopeKey, recorded: new Set<string>() }),
    [sessionVersion, scopeKey],
  );
}

/** Only the focused answer whose body is ready may report a read. */
export function useAnswerDetailRead(
  answerId: string,
  questionId: string | undefined,
  enabled: boolean,
  sharedSession?: AnswerReadSession,
): void {
  const localSession = useAnswerReadSession();
  const session = sharedSession ?? localSession;
  const active = useActiveScreen();
  const authenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );

  useEffect(() => {
    const id = answerId.trim();
    if (
      !id ||
      !enabled ||
      !active ||
      !authenticated ||
      session.sessionVersion !== getAuthSessionVersion()
    )
      return;

    const question = questionId?.trim();
    const targets: ContentReadTarget[] = [];
    if (question && !session.recorded.has(`question:${question}`))
      targets.push({ type: 'question', id: question });
    if (targets.length > 0 || !session.recorded.has(`answer:${id}`))
      targets.push({ type: 'answer', id });
    if (targets.length === 0) return;

    const reservations = targets
      .map((target) => `${target.type}:${target.id}`)
      .filter((key) => !session.recorded.has(key));
    for (const key of reservations) session.recorded.add(key);
    void readContents(targets, {
      sessionVersion: session.sessionVersion,
    }).catch(() => {
      // Failed reads may retry later; a previous account's set stays isolated.
      for (const key of reservations) session.recorded.delete(key);
    });
  }, [answerId, questionId, enabled, active, authenticated, session]);
}
