import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import {
  type AnswerSegmentCommentTarget,
  getAnswerCommentsV5,
  getArticleCommentsV5,
  getChildCommentsV5,
  getPinCommentsV5,
  getQuestionCommentsV5,
  getSegmentComments,
  type ZhihuCommentResponse,
} from '@/api/zhihu';
import { refreshInfiniteQuery } from '@/utils/query';

// V5 cursors can be opaque strings; preserve their URL encoding for the API.
function nextCommentOffset(page: ZhihuCommentResponse) {
  if (page.paging?.is_end) return undefined;
  const offset = page.paging?.next?.match(/[?&]offset=([^&#]*)/)?.[1];
  return offset || undefined;
}

function useCommentQuery({
  queryKey,
  queryPage,
  enabled = true,
}: {
  queryKey: QueryKey;
  queryPage: (offset: string) => Promise<ZhihuCommentResponse>;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const query = useInfiniteQuery<
    ZhihuCommentResponse,
    Error,
    InfiniteData<ZhihuCommentResponse, string>,
    QueryKey,
    string
  >({
    queryKey,
    queryFn: ({ pageParam }) => queryPage(pageParam),
    initialPageParam: '',
    enabled,
    getNextPageParam: (lastPage, _pages, _lastOffset, pageParams) => {
      const next = nextCommentOffset(lastPage);
      return next && !pageParams.includes(next) ? next : undefined;
    },
  });
  const seen = new Set<string>();
  const comments = (
    query.data?.pages.flatMap((page) => page.data || []) || []
  ).filter((comment) => {
    const id = String(comment.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshInfiniteQuery(queryClient, queryKey);
    } finally {
      setRefreshing(false);
    }
  };
  return { ...query, comments, refresh, refreshing };
}

export function useCommentListQuery({
  id,
  type,
  segmentId,
  segmentTarget,
  orderBy,
}: {
  id: string;
  type: string;
  segmentId?: string;
  segmentTarget: AnswerSegmentCommentTarget | null;
  orderBy: 'score' | 'ts';
}) {
  return useCommentQuery({
    queryKey: ['comments', id, type, segmentId, orderBy],
    enabled: Boolean(id) && (segmentId === undefined || segmentTarget !== null),
    queryPage: async (pageParam) => {
      if (segmentId !== undefined) {
        if (!segmentTarget) throw new Error('知识点评论目标无效');
        const offset = Number(pageParam || 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw new Error('知识点评论分页位置无效');
        const response = await getSegmentComments(
          segmentTarget.answerId,
          segmentTarget.segmentIds.join(','),
          offset,
        );
        return {
          data: response.data || [],
          paging: response.paging || {
            is_end: true,
            is_start: true,
            next: '',
            previous: '',
            totals: response.data?.length || 0,
          },
        };
      }
      const fetchComments =
        type === 'question'
          ? getQuestionCommentsV5
          : type === 'article'
            ? getArticleCommentsV5
            : type === 'pin'
              ? getPinCommentsV5
              : getAnswerCommentsV5;
      return fetchComments(id, 20, pageParam, orderBy);
    },
  });
}

export function useCommentRepliesQuery(id: string) {
  return useCommentQuery({
    queryKey: ['replies', id],
    enabled: Boolean(id),
    queryPage: (offset) => getChildCommentsV5(id, 20, offset),
  });
}
