import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addArticleToCollection,
  addToCollection,
  getAllContentCollectionStatus,
  removeArticleFromCollection,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import type { ZhihuCollectionStatusResponse } from '@/types/zhihu';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

interface CollectionSelectionVariables {
  contentId: string | number;
  contentType: 'answer' | 'article';
  folderId: string | number;
  isFavorited: boolean;
}

export function collectionSelectorStatusKey(
  contentId: string | number | null,
  contentType: 'answer' | 'article' | null,
) {
  return ['collection-selector-status', contentId, contentType] as const;
}

/** Keep delayed folder mutations attached to the content that started them. */
export function useCollectionSelectionToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      contentId,
      contentType,
      folderId,
      isFavorited,
    }: CollectionSelectionVariables) => {
      if (contentType === 'answer') {
        return isFavorited
          ? removeFromCollection(folderId, contentId)
          : addToCollection(folderId, contentId);
      }
      return isFavorited
        ? removeArticleFromCollection(folderId, contentId)
        : addArticleToCollection(folderId, contentId);
    },
    onMutate: ({ contentId, contentType }) => {
      const id = String(contentId);
      const cached = queryClient.getQueryData<ZhihuCollectionStatusResponse>(
        collectionSelectorStatusKey(contentId, contentType),
      );
      return {
        sessionVersion: getAuthSessionVersion(),
        wasCollected:
          useCollectionStore.getState().collectedStatusMap[id] ??
          cached?.data.some((item) => item.is_favorited) ??
          false,
      };
    },
    onSuccess: async (_result, { contentId, contentType }, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      const key = collectionSelectorStatusKey(contentId, contentType);
      // Force a fresh read after the write; an earlier in-flight read is stale.
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const updated = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => getAllContentCollectionStatus(contentId, contentType),
        staleTime: 0,
      });
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      const id = String(contentId);
      const hasCollections = updated.data.some((item) => item.is_favorited);
      const state = useCollectionStore.getState();
      const wasCollected =
        state.collectedStatusMap[id] ?? context?.wasCollected;
      if (wasCollected !== hasCollections) {
        state.updateCollectedCountOffset(id, hasCollections ? 1 : -1);
      }
      state.setCollectedStatus(id, hasCollections);
      updateContentInteractionCaches(queryClient, {
        type: contentType === 'answer' ? 'answers' : 'articles',
        id,
        isCollected: hasCollections,
      });
    },
    onSettled: (_data, _error, { contentId, contentType }, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      return queryClient.invalidateQueries({
        queryKey: [`${contentType}-collection-status`, String(contentId)],
        exact: true,
      });
    },
    onError: (error: unknown) => {
      showToast(getZhihuErrorMessage(error) || '操作失败');
    },
  });
}
