import { useAuthStore } from '@/store/useAuthStore';
import type {
  ZhihuCollectionDetailResponse,
  ZhihuCollectionItemsResponse,
  ZhihuCollectionMutationResponse,
  ZhihuCollectionStatusResponse,
  ZhihuCollectionSummary,
  ZhihuPaging,
} from '@/types/zhihu';
import apiClient from '../client';

const COLLECTION_INCLUDE =
  'data[*].updated_time,answer_count,follower_count,creator,description,is_following,comment_count,created_time;data[*].creator.kvip_info;data[*].creator.vip_info';

export const getMyCollections = async (
  limit = 20,
  offset = 0,
): Promise<{ data: ZhihuCollectionSummary[]; paging: ZhihuPaging }> => {
  const me = useAuthStore.getState().me;
  const userId = me?.url_token || 'me';
  const res = await apiClient.get<{
    data: ZhihuCollectionSummary[];
    paging: ZhihuPaging;
  }>(
    `/people/${userId}/collections?limit=${limit}&offset=${offset}&include=${COLLECTION_INCLUDE}`,
  );
  return res.data;
};

export const getUserCollections = async (
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ data: ZhihuCollectionSummary[]; paging: ZhihuPaging }> => {
  const res = await apiClient.get<{
    data: ZhihuCollectionSummary[];
    paging: ZhihuPaging;
  }>(
    `/people/${userId}/collections?limit=${limit}&offset=${offset}&include=${COLLECTION_INCLUDE}`,
  );
  return res.data;
};

export const getCollection = async (
  id: string | number,
): Promise<ZhihuCollectionDetailResponse> => {
  const res = await apiClient.get<ZhihuCollectionDetailResponse>(
    `/collections/${id}`,
  );
  return res.data;
};

export const getCollectionDetail = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuCollectionItemsResponse> => {
  // 使用 /items 接口
  const res = await apiClient.get<ZhihuCollectionItemsResponse>(
    `/collections/${id}/items?limit=${limit}&offset=${offset}`,
  );
  return res.data;
};

export const createCollection = async (data: {
  title: string;
  description: string;
  is_public: boolean;
}): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.post<ZhihuCollectionMutationResponse>(
    '/collections',
    data,
  );
  return res.data;
};

export const updateCollection = async (
  id: string | number,
  data: { title: string; description: string; is_public: boolean },
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.put<ZhihuCollectionMutationResponse>(
    `/collections/${id}`,
    data,
  );
  return res.data;
};

export const deleteCollection = async (
  id: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.delete<ZhihuCollectionMutationResponse>(
    `/collections/${id}`,
  );
  return res.data;
};

/**
 * 获取回答被收藏的状态及所属收藏夹列表
 * GET /collections/contents/answer/{answer_id}
 */
export const getAnswerCollectionStatus = async (
  answerId: string | number,
  limit = 5,
  offset = 0,
): Promise<ZhihuCollectionStatusResponse> => {
  const res = await apiClient.get<ZhihuCollectionStatusResponse>(
    `/collections/contents/answer/${answerId}`,
    { params: { limit, offset } },
  );
  return res.data;
};

/**
 * 添加到收藏夹
 * POST /collections/{collection_id}/contents?content_id={answer_id}&content_type=answer
 */
export const addToCollection = async (
  collectionId: string | number,
  answerId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.post<ZhihuCollectionMutationResponse>(
    `/collections/${collectionId}/contents`,
    null,
    {
      params: {
        content_id: answerId,
        content_type: 'answer',
      },
    },
  );
  return res.data;
};

/**
 * 从收藏夹中删除
 * DELETE /collections/{collection_id}/contents/{answer_id}?content_type=answer
 */
export const removeFromCollection = async (
  collectionId: string | number,
  answerId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.delete<ZhihuCollectionMutationResponse>(
    `/collections/${collectionId}/contents/${answerId}`,
    {
      params: {
        content_type: 'answer',
      },
    },
  );
  return res.data;
};

/**
 * 快速收藏到默认收藏夹
 * POST /collections/contents/answer/{answer_id}
 */
export const fastCollectAnswer = async (
  answerId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.post<ZhihuCollectionMutationResponse>(
    `/collections/contents/answer/${answerId}`,
  );
  return res.data;
};

/**
 * 获取文章被收藏的状态及所属收藏夹列表
 * GET /collections/contents/article/{article_id}
 */
export const getArticleCollectionStatus = async (
  articleId: string | number,
  limit = 5,
  offset = 0,
): Promise<ZhihuCollectionStatusResponse> => {
  const res = await apiClient.get<ZhihuCollectionStatusResponse>(
    `/collections/contents/article/${articleId}`,
    {
      params: { limit, offset },
    },
  );
  return res.data;
};

/** Collection selection and removal must consider every folder, not just page 1. */
export async function getAllContentCollectionStatus(
  contentId: string | number,
  contentType: 'answer' | 'article',
): Promise<ZhihuCollectionStatusResponse> {
  const getPage =
    contentType === 'answer'
      ? getAnswerCollectionStatus
      : getArticleCollectionStatus;
  const data: ZhihuCollectionStatusResponse['data'] = [];
  const seenIds = new Set<string>();
  let offset = 0;
  while (true) {
    const page = await getPage(contentId, 20, offset);
    for (const item of page.data) {
      const id = String(item.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      data.push(item);
    }
    if (!page.paging || page.paging.is_end) {
      return { data, paging: page.paging };
    }
    const nextOffset = Number(
      page.paging.next?.match(/[?&]offset=(\d+)(?:&|$)/)?.[1],
    );
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new Error('收藏夹分页无效，请稍后重试');
    }
    offset = nextOffset;
  }
}

/**
 * 添加文章到收藏夹
 * POST /collections/{collection_id}/contents?content_id={article_id}&content_type=article
 */
export const addArticleToCollection = async (
  collectionId: string | number,
  articleId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.post<ZhihuCollectionMutationResponse>(
    `/collections/${collectionId}/contents`,
    null,
    {
      params: {
        content_id: articleId,
        content_type: 'article',
      },
    },
  );
  return res.data;
};

/**
 * 从收藏夹中删除文章
 * DELETE /collections/{collection_id}/contents/{article_id}?content_type=article
 */
export const removeArticleFromCollection = async (
  collectionId: string | number,
  articleId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.delete<ZhihuCollectionMutationResponse>(
    `/collections/${collectionId}/contents/${articleId}`,
    {
      params: {
        content_type: 'article',
      },
    },
  );
  return res.data;
};

/**
 * 快速收藏文章到默认收藏夹
 * POST /collections/contents/article/{article_id}
 */
export const fastCollectArticle = async (
  articleId: string | number,
): Promise<ZhihuCollectionMutationResponse> => {
  const res = await apiClient.post<ZhihuCollectionMutationResponse>(
    `/collections/contents/article/${articleId}`,
  );
  return res.data;
};
