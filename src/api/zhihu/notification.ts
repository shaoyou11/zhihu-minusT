import type {
  ZhihuActionResponse,
  ZhihuNotificationResponse,
} from '@/types/zhihu';
import apiClient, { type ApiRequestOptions } from '../client';

export const getNotifications = async (
  nextUrl?: string,
  entryName: string = 'all',
  options: ApiRequestOptions = {},
): Promise<ZhihuNotificationResponse> => {
  const url =
    nextUrl || `/notifications/v2/recent?limit=10&entry_name=${entryName}`;
  const res = await apiClient.get<ZhihuNotificationResponse>(url, {
    signal: options.signal,
  });
  return res.data;
};

export const markAllNotificationsRead =
  async (): Promise<ZhihuActionResponse> => {
    const res = await apiClient.post<ZhihuActionResponse>(
      '/notifications/v2/timeline/actions/readall',
      {},
    );
    return res.data;
  };
