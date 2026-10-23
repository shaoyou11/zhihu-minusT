import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { searchContent } from '@/api/zhihu';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { getZhihuNextOffset } from '@/hooks/useZhihuInfiniteQuery';
import { refreshInfiniteQuery } from '@/utils/query';

export function useProfileSearch(memberId: string | undefined) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const pending = query.trim() !== searchTerm;

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useInfiniteQuery({
    queryKey: ['user-creations-search', memberId, searchTerm],
    queryFn: ({ pageParam, signal }) =>
      searchContent(searchTerm, pageParam, 20, 'general', {
        restricted_scene: 'member',
        restricted_field: 'member_hash_id',
        restricted_value: memberId,
        signal,
      }),
    initialPageParam: 0,
    enabled: Boolean(memberId && searchTerm) && !pending,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      const nextOffset = getZhihuNextOffset(lastPage);
      return nextOffset !== undefined && nextOffset > lastOffset
        ? nextOffset
        : undefined;
    },
  });
  const reset = useCallback(
    () =>
      refreshInfiniteQuery(queryClient, [
        'user-creations-search',
        memberId,
        searchTerm,
      ]),
    [memberId, queryClient, searchTerm],
  );
  const { refresh, refreshing } = useRefreshAction(reset);

  return {
    ...results,
    query,
    setQuery,
    searchTerm,
    pending,
    refresh,
    refreshing,
    submit: () => setSearchTerm(query.trim()),
    clear: () => {
      setQuery('');
      setSearchTerm('');
    },
  };
}
