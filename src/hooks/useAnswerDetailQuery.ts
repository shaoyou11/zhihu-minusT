import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CanceledError } from 'axios';
import { useEffect } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { getAnswer } from '@/api/zhihu';
import { getQuestionAnswers } from '@/api/zhihu/question';
import { RICH_CONTENT_STALE_TIME } from '@/features/rich-content';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { getAnswerPreviewEntryKey } from '@/utils/answerPreviewEntry';
import {
  getGuestAnswerKey,
  guestAnswerFromPreview,
  mergeGuestAnswer,
} from '@/utils/guestAnswer';
import { shouldRetryQuery } from '@/utils/query';
import { SafeFeedbackError } from '@/utils/safeFeedback';

interface AnswerDetailQueryOptions {
  enabled?: boolean;
  questionId?: string | number;
}

/** Read public question cards as-is; only signed-in readers request Web details. */
export function useAnswerDetailQuery(
  id: string,
  { enabled = true, questionId }: AnswerDetailQueryOptions = {},
) {
  const client = useQueryClient();
  const authenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const query = useQuery({
    queryKey: authenticated
      ? ['answer-detail', id]
      : getGuestAnswerKey(id, sessionVersion),
    initialData: authenticated
      ? undefined
      : () =>
          guestAnswerFromPreview(
            client.getQueryData(getAnswerPreviewEntryKey(id, sessionVersion)),
          ),
    queryFn: async ({ signal }) => {
      const assertSession = () => {
        if (sessionVersion !== getAuthSessionVersion())
          throw new CanceledError('登录会话已切换');
      };
      assertSession();
      if (authenticated) {
        const answer = await getAnswer(id, undefined, { signal });
        assertSession();
        return answer;
      }
      if (!questionId)
        throw new SafeFeedbackError('guest-answer-source-missing');
      const page = await getQuestionAnswers(questionId, 0, 'default', '', {
        signal,
      });
      assertSession();
      const answer = page.data.find((item) => String(item.id) === id);
      if (!answer?.content?.trim())
        throw new SafeFeedbackError('guest-answer-unavailable');
      return mergeGuestAnswer(
        client.getQueryData(getGuestAnswerKey(id, sessionVersion)),
        {
          ...answer,
          question: answer.question ?? {
            id: questionId,
            title: '',
            type: 'question' as const,
          },
        },
      );
    },
    enabled: enabled && Boolean(id),
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: shouldRetryQuery,
    retryOnMount: false,
  });
  const { error, refetch } = query;
  useEffect(() => {
    // A profile pager can supply the question after the clicked card mounts.
    // Recover only this missing-source error, never retry a failed API in a loop.
    if (
      enabled &&
      !authenticated &&
      questionId &&
      error instanceof SafeFeedbackError &&
      error.code === 'guest-answer-source-missing'
    )
      void refetch();
  }, [enabled, authenticated, questionId, error, refetch]);
  return { ...query, isGuest: !authenticated };
}
