import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getComment } from '@/api/zhihu/comment';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { parseParentComment } from '@/utils/commentRoute';

export function useParentComment(id: string, parent: string | undefined) {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const snapshot = useMemo(
    () => parseParentComment(parent, id, sessionVersion),
    [parent, id, sessionVersion],
  );
  const query = useQuery({
    queryKey: ['parent-comment', id, sessionVersion],
    queryFn: async () => {
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录会话已变化，请重新加载评论');
      const comment = await getComment(id);
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录会话已变化，请重新加载评论');
      return comment;
    },
    enabled: !snapshot && Boolean(id),
    placeholderData: undefined,
  });
  return {
    ...query,
    parentComment: snapshot ?? query.data,
    sessionVersion,
  };
}
