import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getAnswer } from '@/api/zhihu';
import {
  getNeighborAnswerIds,
  RICH_CONTENT_STALE_TIME,
} from '@/features/rich-content';
import { useActiveScreen } from './useActiveScreen';

/** At most two neighboring bodies are fetched; abandoned preloads are cancelled. */
export function useNeighborAnswerPrefetch(
  answerIds: string[],
  currentPage: number,
) {
  const client = useQueryClient();
  const active = useActiveScreen();
  const currentId = answerIds[currentPage];
  const [firstNeighborId, secondNeighborId] = getNeighborAnswerIds(
    answerIds,
    currentPage,
  );
  const pending = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    // A promoted preload must survive until its visible observer updates.
    const retained = new Set(
      active ? [currentId, firstNeighborId, secondNeighborId] : [],
    );
    for (const id of pending.current.keys()) {
      if (retained.has(id)) continue;
      const key = ['answer-detail', id];
      const query = client.getQueryCache().find({ queryKey: key, exact: true });
      if (query && !query.isActive()) {
        pending.current.delete(id);
        void client.cancelQueries({ queryKey: key, exact: true });
      }
    }

    if (!active) return;
    for (const id of [firstNeighborId, secondNeighborId]) {
      if (!id || pending.current.has(id)) continue;
      const preload = client.prefetchQuery({
        queryKey: ['answer-detail', id],
        queryFn: ({ signal }) => getAnswer(id, undefined, { signal }),
        staleTime: RICH_CONTENT_STALE_TIME,
        gcTime: 2 * 60 * 1000,
      });
      pending.current.set(id, preload);
      void preload.finally(() => {
        if (pending.current.get(id) === preload) pending.current.delete(id);
      });
    }
  }, [active, currentId, firstNeighborId, secondNeighborId, client]);

  useEffect(
    () => () => {
      for (const id of pending.current.keys()) {
        const key = ['answer-detail', id];
        const query = client
          .getQueryCache()
          .find({ queryKey: key, exact: true });
        if (query && !query.isActive())
          void client.cancelQueries({ queryKey: key, exact: true });
      }
      pending.current.clear();
    },
    [client],
  );
}
