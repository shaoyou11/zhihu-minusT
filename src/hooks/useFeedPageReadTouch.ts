import {
  hashKey,
  type InfiniteData,
  type QueryKey,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { touchAnswersRead } from '@/api/zhihu/lastRead';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { getNextUnvisitedFeedPage } from '@/utils/feedPagination';
import type { FeedReadTouchBatch } from '@/utils/feedReadTouch';
import { useActiveScreen } from './useActiveScreen';

interface FeedTouchPage {
  nextUrl: string | null;
  readTouchBatch?: FeedReadTouchBatch | null;
}

/** Only explicit forward pagination reports the preceding API response batch. */
export function useFeedPageReadTouch(
  queryKey: QueryKey,
  fetchNextPage: (options: { cancelRefetch: false }) => Promise<unknown>,
  enabled: boolean,
): () => Promise<unknown> {
  const queryClient = useQueryClient();
  const active = useActiveScreen();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const scope = hashKey(queryKey);
  const recorded = useMemo(
    () => ({
      scope,
      sessionVersion,
      batches: new WeakSet<FeedReadTouchBatch>(),
    }),
    [scope, sessionVersion],
  );
  const current = useRef({ enabled, active, recorded });
  current.current = { enabled, active, recorded };

  return useCallback(async () => {
    if (
      !current.current.enabled ||
      !current.current.active ||
      current.current.recorded !== recorded ||
      sessionVersion !== getAuthSessionVersion() ||
      queryClient.getQueryState(queryKey)?.fetchStatus !== 'idle'
    )
      return;

    // Read the live cache so repeated callbacks cannot report an older page.
    const data =
      queryClient.getQueryData<InfiniteData<FeedTouchPage, string>>(queryKey);
    const lastPage = data?.pages.at(-1);
    if (
      !lastPage ||
      !getNextUnvisitedFeedPage(lastPage.nextUrl, data?.pageParams ?? [])
    )
      return;

    const batch = lastPage.readTouchBatch;
    if (
      batch &&
      batch.sessionVersion === sessionVersion &&
      batch.answerIds.length > 0 &&
      hasAuthenticationCookie(useAuthStore.getState().cookies) &&
      !recorded.batches.has(batch)
    ) {
      recorded.batches.add(batch);
      void touchAnswersRead(batch.answerIds, { sessionVersion }).catch(() => {
        // A later attempt to advance this same page may retry failed feedback.
        recorded.batches.delete(batch);
      });
    }
    // Feedback is optional and must never delay or fail forward pagination.
    return fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, queryClient, queryKey, recorded, sessionVersion]);
}
