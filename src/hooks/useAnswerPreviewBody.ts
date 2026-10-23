import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getNextContentRender,
  getStructuredContentContinuation,
} from '@/api/zhihu/nextRender';
import { mergeStructuredContentPages } from '@/features/rich-content';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import type { ZhihuStructuredContent } from '@/types/zhihu';
import { shouldRetryQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

interface AnswerPreviewBodyOptions {
  scope: string;
  answerId: string;
  sessionVersion: number;
  sourceId: number;
  initialContent: ZhihuStructuredContent;
  onRefresh: () => void;
}

/** Keep loaded body pages and their interaction metadata in the same cache. */
export function useAnswerPreviewBody({
  scope,
  answerId,
  sessionVersion,
  sourceId,
  initialContent,
  onRefresh,
}: AnswerPreviewBodyOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () =>
      ['answer-preview-content', sessionVersion, answerId, sourceId] as const,
    [sessionVersion, answerId, sourceId],
  );
  const epoch = useMemo(
    () => ({
      scope,
      answerId,
      sessionVersion,
      sourceId,
      initialContent,
      refreshing: false,
    }),
    [scope, answerId, sessionVersion, sourceId, initialContent],
  );
  const currentEpoch = useRef(epoch);
  currentEpoch.current = epoch;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      currentEpoch.current === epoch &&
      getAuthSessionVersion() === sessionVersion,
    [epoch, sessionVersion],
  );
  const body = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    initialData: { pages: [initialContent], pageParams: [undefined] },
    enabled: false,
    staleTime: Infinity,
    queryFn: async ({ pageParam, signal }) => {
      if (!isCurrent()) throw new Error('正文阅读来源已变化');
      const content = pageParam
        ? await getNextContentRender(pageParam, { signal, sessionVersion })
        : initialContent;
      if (!isCurrent()) throw new Error('正文阅读来源已变化');
      return content;
    },
    getNextPageParam: (_lastPage, pages, _lastParam, pageParams) =>
      getStructuredContentContinuation(pages, pageParams).next,
    retry: (failureCount, error) =>
      isCurrent() && shouldRetryQuery(failureCount, error),
  });
  const content = useMemo(
    () =>
      body.data?.pages.length
        ? mergeStructuredContentPages(body.data.pages)
        : initialContent,
    [body.data?.pages, initialContent],
  );
  const continuation = useMemo(
    () =>
      body.data
        ? getStructuredContentContinuation(
            body.data.pages,
            body.data.pageParams,
          )
        : {},
    [body.data],
  );
  const currentContinuation = useRef(continuation);
  currentContinuation.current = continuation;
  const refresh = useCallback(async () => {
    if (!isCurrent() || epoch.refreshing) return;
    epoch.refreshing = true;
    try {
      // Manual refetch is required because this query is deliberately disabled.
      // InfiniteQuery reuses the loaded page count and recomputes their cursors.
      await body.refetch({ cancelRefetch: true });
    } finally {
      epoch.refreshing = false;
      if (isCurrent()) onRefresh();
    }
  }, [body.refetch, epoch, isCurrent, onRefresh]);
  const hasRefetchError = body.isRefetchError;
  const fetchMore = useCallback(
    async (automatic: boolean) => {
      if (!isCurrent() || epoch.refreshing) return;
      const state = queryClient.getQueryState(queryKey);
      if (state?.fetchStatus === 'fetching') return;
      // An auto callback may outlive the render that first observed a failure.
      if (
        automatic &&
        (state?.status === 'error' ||
          !currentContinuation.current.next ||
          currentContinuation.current.error)
      )
        return;
      return body.fetchNextPage({ cancelRefetch: false });
    },
    [body.fetchNextPage, epoch, isCurrent, queryClient, queryKey],
  );
  const autoLoadMore =
    continuation.next &&
    !body.isFetchNextPageError &&
    !hasRefetchError &&
    !continuation.error
      ? () => fetchMore(true)
      : undefined;
  const loadMore =
    continuation.next || hasRefetchError || continuation.error
      ? () => {
          if (!isCurrent() || epoch.refreshing || body.isFetching) return;
          if (hasRefetchError || continuation.error) void refresh();
          else void fetchMore(false);
        }
      : undefined;
  const onExpandedChange = (expanded: boolean) => {
    if (
      isCurrent() &&
      expanded &&
      body.data?.pages.length === 1 &&
      !body.isFetchNextPageError &&
      !hasRefetchError
    )
      void autoLoadMore?.();
  };
  return {
    content,
    hasMore: Boolean(continuation.next),
    isLoadingMore: body.isFetching,
    loadMoreError:
      body.isFetchNextPageError || hasRefetchError
        ? getZhihuErrorMessage(body.error)
        : continuation.error,
    loadMore,
    autoLoadMore,
    onExpandedChange,
    refresh,
  };
}
