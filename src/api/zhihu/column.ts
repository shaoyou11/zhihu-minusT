import type {
  ZhihuColumnDetail,
  ZhihuColumnItem,
  ZhihuPaging,
} from '../../types/zhihu';
import apiClient, { type ApiRequestOptions } from '../client';

export const getColumn = async (
  id: string | number,
): Promise<ZhihuColumnDetail> => {
  const include =
    'intro,followers,articles_count,items_count,author,is_following';
  const res = await apiClient.get<ZhihuColumnDetail>(`/columns/${id}`, {
    params: { include },
  });
  return res.data;
};

export const getColumnItems = async (
  id: string | number,
  limit = 20,
  offset = 0,
  options: ApiRequestOptions = {},
): Promise<{ paging: ZhihuPaging; data: ZhihuColumnItem[] }> => {
  const res = await apiClient.get<{
    paging: ZhihuPaging;
    data: ZhihuColumnItem[];
  }>(`/columns/${id}/items`, {
    signal: options.signal,
    params: {
      limit,
      offset,
      ws_qiangzhisafe: 0,
    },
  });
  return res.data;
};

export const getArticleColumnCard = async (
  articleId: string | number,
): Promise<ZhihuColumnDetail> => {
  const res = await apiClient.get<ZhihuColumnDetail>(
    `/column/articles/${articleId}/card`,
  );
  return res.data;
};

export const followColumn = async (
  columnId: string | number,
): Promise<{ member_count?: number; is_following?: boolean }> => {
  const res = await apiClient.post<{
    member_count?: number;
    is_following?: boolean;
  }>(`/columns/${columnId}/followers`);
  return res.data;
};

export const unfollowColumn = async (
  columnId: string | number,
): Promise<{ member_count?: number; is_following?: boolean }> => {
  const res = await apiClient.delete<{
    member_count?: number;
    is_following?: boolean;
  }>(`/columns/${columnId}/followers`);
  return res.data;
};
