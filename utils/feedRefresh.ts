import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { refreshInfiniteQuery } from './query';

/** Start the fresh first page immediately, alongside optional local dedup IO. */
export async function refreshFeedQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
  readExposureKeys?: () => Promise<Set<string> | undefined>,
): Promise<Set<string> | undefined> {
  const [, exposureKeys] = await Promise.all([
    refreshInfiniteQuery(queryClient, queryKey),
    readExposureKeys?.(),
  ]);
  // A failed refresh must not hide the retained cards using newly read exposure
  // keys. The query owns the error state and the next pull can retry normally.
  const state = queryClient.getQueryState(queryKey);
  return state?.status === 'success' && state.fetchStatus === 'idle'
    ? exposureKeys
    : undefined;
}
