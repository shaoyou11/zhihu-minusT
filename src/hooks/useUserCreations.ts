import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  getRecentMemberActivities,
  type ZhihuMember,
} from '@/api/zhihu/member';
import { refreshInfiniteQuery } from '@/utils/query';
import {
  deduplicateUserCreations,
  getNextUserCreationsCursor,
  toUserCreationFeedItem,
  type UserCreationsPageParam,
} from '@/utils/userCreations';
import { useRefreshAction } from './useRefreshAction';

/** Shared by the profile's 创作 tab and the recent-updates entry point. */
export function useUserCreations(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const memberId = member?.id;
  const queryKey = useMemo(
    () => ['user-recent-published-activities', memberId] as const,
    [memberId],
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      if (!memberId) throw new Error('用户资料尚未加载');
      return getRecentMemberActivities(
        memberId,
        pageParam ?? { offset: Date.now(), pageNum: 1 },
        signal,
      );
    },
    initialPageParam: null as UserCreationsPageParam,
    getNextPageParam: (lastPage, _pages, lastCursor, cursors) =>
      getNextUserCreationsCursor(lastPage, lastCursor, cursors),
    enabled: enabled && Boolean(memberId),
  });
  const activities = useMemo(
    () =>
      deduplicateUserCreations(
        query.data?.pages.flatMap((page) => page.data) ?? [],
      ),
    [query.data],
  );
  const feedItems = useMemo(
    () =>
      member
        ? activities.flatMap((activity) => {
            const item = toUserCreationFeedItem(activity, member);
            return item ? [item] : [];
          })
        : [],
    [activities, member],
  );
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return { ...query, queryKey, activities, feedItems, refresh, refreshing };
}
