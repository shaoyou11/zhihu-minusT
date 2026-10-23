import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import {
  getMemberAnswersVotedByMe,
  type ZhihuMember,
} from '@/api/zhihu/member';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { refreshInfiniteQuery } from '@/utils/query';
import { useRefreshAction } from './useRefreshAction';
import { useZhihuInfiniteQuery } from './useZhihuInfiniteQuery';

/** Answers by the profile's author that the current viewer has upvoted. */
export function useUserAnswersVotedByMe(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const cookies = useAuthStore((state) => state.cookies);
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const isAuthenticated = hasAuthenticationCookie(cookies);
  const targetId = member?.url_token || member?.id;
  const queryKey = useMemo(
    () => ['user-answers-voted-by-me', targetId, sessionVersion] as const,
    [targetId, sessionVersion],
  );
  const query = useZhihuInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      if (!targetId) throw new Error('用户资料尚未加载');
      if (!isAuthenticated) throw new Error('请先登录');
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new Error('登录状态已变化');
      }
      return getMemberAnswersVotedByMe(targetId, pageParam, signal);
    },
    initialPageParam: 0,
    enabled: enabled && isAuthenticated && Boolean(targetId),
  });
  const answers = useMemo(() => {
    if (!isAuthenticated) return [];
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.data) ?? []).filter(
      (answer) => {
        const id = String(answer.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      },
    );
  }, [isAuthenticated, query.data]);
  const total = isAuthenticated
    ? query.data?.pages[0]?.paging.totals
    : undefined;
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return {
    ...query,
    queryKey,
    answers,
    total,
    isAuthenticated,
    refresh,
    refreshing,
  };
}
