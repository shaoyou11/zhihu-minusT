import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { markRecommendationUninterested } from '@/api/zhihu/feed';
import { feedCacheRepository } from '@/storage/feedCacheRepository';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import {
  type FeedIdentitySource,
  getFeedContentKey,
} from '@/utils/feedIdentity';
import {
  getRecommendFeedbackTarget,
  removeRecommendationFromPages,
} from '@/utils/recommendFeedback';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export function useRecommendFeedback(accountKey: string | null) {
  const queryClient = useQueryClient();
  const sessionVersion = getAuthSessionVersion();
  const scopeKey = `${sessionVersion}:${accountKey || ''}`;
  const scope = useMemo(
    () => ({
      key: scopeKey,
      hidden: new Set<string>(),
      pending: new Set<string>(),
    }),
    [scopeKey],
  );
  const activeScope = useRef<typeof scope | null>(null);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      if (activeScope.current === scope) activeScope.current = null;
    };
  }, [scope]);
  const filterRecommendations = useCallback(
    <TItem extends FeedIdentitySource>(items: TItem[]): TItem[] => {
      return items.filter((item) => {
        const key = getFeedContentKey(item);
        return !key || !scope.hidden.has(key);
      });
    },
    [scope],
  );

  const markUninterested = useCallback(
    async (item: FeedIdentitySource): Promise<void> => {
      const target = getRecommendFeedbackTarget(item);
      const contentKey = target && getFeedContentKey(target);
      if (
        !accountKey ||
        !target ||
        !contentKey ||
        sessionVersion !== getAuthSessionVersion() ||
        !hasAuthenticationCookie(useAuthStore.getState().cookies)
      )
        return;
      const startedScope = scope;
      if (
        activeScope.current !== startedScope ||
        startedScope.pending.has(contentKey) ||
        startedScope.hidden.has(contentKey)
      )
        return;
      startedScope.pending.add(contentKey);
      try {
        await markRecommendationUninterested(target);
        if (
          activeScope.current !== startedScope ||
          sessionVersion !== getAuthSessionVersion()
        )
          return;
        startedScope.hidden.add(contentKey);
        const queryKey = ['zhihu-feed', accountKey, 'recommend'];
        await queryClient.cancelQueries({ queryKey });
        if (
          activeScope.current !== startedScope ||
          sessionVersion !== getAuthSessionVersion()
        )
          return;
        queryClient.setQueriesData<
          InfiniteData<{ items: FeedIdentitySource[] }, string>
        >({ queryKey }, (data) =>
          removeRecommendationFromPages(data, contentKey),
        );
        void feedCacheRepository
          .removeFeedCacheItem(
            { accountKey, feedType: 'recommend' },
            contentKey,
          )
          .catch(() => console.warn('移除启动 Feed 缓存条目失败'));
        showToast('将减少推荐相似内容');
      } catch (error: unknown) {
        if (
          activeScope.current === startedScope &&
          sessionVersion === getAuthSessionVersion()
        )
          showToast(getZhihuErrorMessage(error) || '反馈失败，请重试');
      } finally {
        startedScope.pending.delete(contentKey);
      }
    },
    [accountKey, queryClient, scope, sessionVersion],
  );

  return { markUninterested, filterRecommendations };
}
