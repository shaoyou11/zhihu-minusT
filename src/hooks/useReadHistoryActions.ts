import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  type BatchDelReadHistoryPayload,
  batchDelReadHistory,
} from '@/api/zhihu/history';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { refreshInfiniteQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export const READ_HISTORY_QUERY_KEY = ['read-history'] as const;

export function useReadHistoryActions() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const deleteHistory = async (payload: BatchDelReadHistoryPayload) => {
    if (inFlight.current || (!payload.clear && !payload.pairs?.length)) {
      return false;
    }
    inFlight.current = true;
    setIsPending(true);
    const session = getAuthSessionVersion();
    try {
      await batchDelReadHistory(payload);
      if (session !== getAuthSessionVersion()) return false;
      await refreshInfiniteQuery(queryClient, READ_HISTORY_QUERY_KEY);
      return session === getAuthSessionVersion();
    } catch (error) {
      if (session === getAuthSessionVersion()) {
        Alert.alert(
          payload.clear ? '清空失败' : '删除失败',
          getZhihuErrorMessage(error),
        );
      }
      return false;
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  };

  return { deleteHistory, isPending };
}
