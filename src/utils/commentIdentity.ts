import type { CommentItem, CommentTag } from '@/api/zhihu/comment';

export function normalizeCommentTags(value: unknown): CommentTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag: unknown) => {
    if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return [];
    const record = tag as Record<string, unknown>;
    if (typeof record.type !== 'string' || typeof record.text !== 'string')
      return [];
    const text = record.text.trim();
    return text ? [{ type: record.type, text }] : [];
  });
}

export function getCommentIdentityBadges(
  comment: Pick<
    CommentItem,
    | 'is_author'
    | 'author'
    | 'author_tag'
    | 'comment_tag'
    | 'reply_to_author'
    | 'reply_author_tag'
  >,
  target: 'author' | 'reply' = 'author',
): string[] {
  const author = target === 'reply' ? comment.reply_to_author : comment.author;
  const tags = normalizeCommentTags(
    target === 'reply' ? comment.reply_author_tag : comment.author_tag,
  );
  const labels = [
    ...(target === 'author' && comment.is_author === true ? ['作者'] : []),
    ...(author?.member.is_following === true ? ['我关注的人'] : []),
    ...tags.map((tag) => tag.text),
    ...(target === 'author'
      ? normalizeCommentTags(comment.comment_tag)
          .filter((tag) => tag.type !== 'ip_info')
          .map((tag) => tag.text)
      : []),
  ];
  return [...new Set(labels)];
}
