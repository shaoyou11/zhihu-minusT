import type { CommentItem } from '@/api/zhihu/comment';
import { Text, useThemeColor } from '@/components/Themed';
import { getCommentIdentityBadges } from '@/utils/commentIdentity';

export function CommentIdentityBadges({
  comment,
  target = 'author',
}: {
  comment: CommentItem;
  target?: 'author' | 'reply';
}) {
  const color = useThemeColor({}, 'link');
  return getCommentIdentityBadges(comment, target).map((label) => (
    <Text key={label} style={{ color, fontSize: 11, fontWeight: '500' }}>
      {` · ${label}`}
    </Text>
  ));
}
