import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import type { AnswerDetail } from '@/api/zhihu/answer';
import {
  type AnswerPagerPage,
  getQuestionAnswerPagerPage,
  normalizeAnswerPagerPage,
} from '@/api/zhihu/answerPager';
import { getMemberRelations } from '@/api/zhihu/member';
import { getQuestionAnswers } from '@/api/zhihu/question';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import type { AnswerReadingContext } from '@/utils/answerReadingContext';
import { seedGuestAnswerFromList } from '@/utils/guestAnswer';
import { getZhihuNextOffset } from './useZhihuInfiniteQuery';

const PROFILE_ANSWER_PAGER_INCLUDE = 'data[*].id,question.id,endorsements';

export interface AnswerPagerSourceOptions {
  initialId: string;
  questionId?: string | number;
  sortBy: string;
  context: AnswerReadingContext;
  initialAnswer?: AnswerDetail;
}

/** Default to same-question paging; explicit profiles page the author's answers. */
export function useAnswerPagerSource({
  questionId,
  sortBy,
  context,
  initialAnswer,
}: AnswerPagerSourceOptions) {
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const isAuthenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const { scene } = context;
  const isQuestionSource = scene !== 'profile_answer';
  const memberId =
    context.memberId?.trim() ||
    initialAnswer?.author.url_token?.trim() ||
    initialAnswer?.author.id;
  const sourceId = isQuestionSource
    ? String(questionId ?? initialAnswer?.question?.id ?? '')
    : (memberId ?? '');
  const sourceSort = isQuestionSource
    ? sortBy
    : (context.memberSort ?? 'created');
  const queryKey = useMemo(
    () =>
      [
        'answer-pager-source',
        sessionVersion,
        scene,
        sourceId,
        sourceSort,
      ] as const,
    [sessionVersion, scene, sourceId, sourceSort],
  );
  const query = useInfiniteQuery<
    AnswerPagerPage,
    Error,
    InfiniteData<AnswerPagerPage, number | string>,
    typeof queryKey,
    number | string
  >({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录状态已变化');
      if (!sourceId) throw new Error('回答列表来源尚未加载');
      if (!isAuthenticated && isQuestionSource) {
        const guestPage = await getQuestionAnswers(
          sourceId,
          pageParam,
          sourceSort === 'created' ? 'created' : 'default',
          '',
          { signal },
        );
        if (sessionVersion !== getAuthSessionVersion())
          throw new Error('登录状态已变化');
        for (const answer of guestPage.data) {
          seedGuestAnswerFromList(
            queryClient,
            {
              ...answer,
              question: answer.question ?? {
                id: sourceId,
                title: '',
                type: 'question',
              },
            },
            sessionVersion,
          );
        }
        return normalizeAnswerPagerPage(guestPage);
      }
      const offset =
        typeof pageParam === 'number'
          ? pageParam
          : (getZhihuNextOffset({ paging: { next: pageParam } }) ?? 0);
      const page =
        scene === 'profile_answer'
          ? normalizeAnswerPagerPage(
              await getMemberRelations(
                sourceId,
                'answers',
                {
                  include: PROFILE_ANSWER_PAGER_INCLUDE,
                  limit: 20,
                  offset,
                  sort_by: sourceSort,
                  ws_qiangzhisafe: 0,
                },
                { signal },
              ),
            )
          : await getQuestionAnswerPagerPage(sourceId, sourceSort, offset, {
              signal,
            });
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录状态已变化');
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      !isAuthenticated && isQuestionSource
        ? lastPage.paging?.is_end
          ? undefined
          : lastPage.paging?.next || undefined
        : getZhihuNextOffset(lastPage),
    enabled: Boolean(sourceId),
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    pagerKey: JSON.stringify(queryKey),
    queryKey,
    isQuestionSource,
    sessionVersion,
  };
}
