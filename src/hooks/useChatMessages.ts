import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { getMessages } from '@/api/zhihu';
import { useActiveScreen } from './useActiveScreen';

/** Poll the latest page only; reading history must not multiply polling cost. */
export function useChatMessages(id: string, accountKey: string | null) {
  const active = useActiveScreen();
  const client = useQueryClient();
  const latestKey = ['chat-latest', accountKey, id] as const;
  const historyKey = ['chat-history', accountKey, id] as const;
  const latest = useQuery({
    queryKey: latestKey,
    queryFn: ({ signal }) => getMessages(id, '', { signal }),
    enabled: active && Boolean(id && accountKey),
    refetchInterval: active ? 5000 : false,
    gcTime: 2 * 60 * 1000,
  });
  const history = useInfiniteQuery({
    queryKey: historyKey,
    queryFn: ({ pageParam, signal }) => getMessages(id, pageParam, { signal }),
    initialPageParam: latest.data?.paging?.next ?? '',
    getNextPageParam: (page) =>
      page.paging?.is_end ? undefined : page.paging?.next,
    enabled: false,
    gcTime: 2 * 60 * 1000,
  });
  useEffect(() => {
    if (!latest.data) return;
    const page = latest.data;
    client.setQueryData<InfiniteData<typeof page, string>>(
      ['chat-history', accountKey, id],
      (previous) => {
        if (!previous?.pages.length) return { pages: [page], pageParams: [''] };
        const first = previous.pages[0];
        const ids = new Set(page.data.map((message) => message.info?.id));
        // Retain messages that have slid out of the latest API page. Otherwise
        // polling would create a gap before the already loaded history cursor.
        const data = [
          ...page.data,
          ...first.data.filter((message) => !ids.has(message.info?.id)),
        ];
        return {
          ...previous,
          pages: [{ ...first, data }, ...previous.pages.slice(1)],
        };
      },
    );
  }, [latest.data, client, accountKey, id]);
  useEffect(() => {
    if (active) return;
    void client.cancelQueries({
      queryKey: ['chat-latest', accountKey, id],
      exact: true,
    });
    void client.cancelQueries({
      queryKey: ['chat-history', accountKey, id],
      exact: true,
    });
  }, [active, client, accountKey, id]);
  const seen = new Set<string>();
  const messages = [
    ...(latest.data?.data ?? []),
    ...(history.data?.pages.flatMap((page) => page.data) ?? []),
  ].filter((message) => {
    const messageId = message.info?.id;
    if (!messageId || seen.has(messageId)) return false;
    seen.add(messageId);
    return true;
  });
  const hasNextPage = history.data
    ? history.hasNextPage
    : Boolean(latest.data?.paging?.next && !latest.data.paging.is_end);
  return {
    messages,
    isLoading: latest.isLoading,
    isError: latest.isError,
    isFetchingNextPage: history.isFetchingNextPage,
    hasNextPage,
    refetch: latest.refetch,
    fetchNextPage: () =>
      active && hasNextPage && !history.isFetchingNextPage
        ? history.fetchNextPage()
        : Promise.resolve(),
    latestKey,
  };
}
