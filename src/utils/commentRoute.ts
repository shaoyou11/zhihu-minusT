import type { CommentItem } from '@/api/zhihu/comment';
import { normalizeCommentTags } from '@/utils/commentIdentity';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function serializeParentComment(
  comment: CommentItem,
  sessionVersion: number,
): string {
  return JSON.stringify({ sessionVersion, comment });
}

/** Expo Router already decodes query parameters, including literal % in text. */
export function parseParentComment(
  parent: string | undefined,
  expectedId: string,
  sessionVersion: number,
): CommentItem | null {
  if (!parent) return null;
  try {
    const snapshot = record(JSON.parse(parent));
    if (
      !snapshot ||
      typeof snapshot.sessionVersion !== 'number' ||
      !Number.isSafeInteger(snapshot.sessionVersion) ||
      snapshot.sessionVersion < 0 ||
      snapshot.sessionVersion !== sessionVersion
    )
      return null;
    const value = record(snapshot.comment);
    const member = record(record(value?.author)?.member);
    if (
      !value ||
      !member ||
      (typeof value.id !== 'string' && typeof value.id !== 'number') ||
      String(value.id) !== expectedId ||
      typeof value.content !== 'string' ||
      typeof member.id !== 'string' ||
      typeof member.name !== 'string'
    )
      return null;

    const relationship = record(value.relationship);
    return {
      id: value.id,
      type: 'comment',
      content: value.content,
      created_time:
        typeof value.created_time === 'number' ? value.created_time : 0,
      author: {
        member: {
          id: member.id,
          name: member.name,
          url_token:
            typeof member.url_token === 'string' ? member.url_token : '',
          avatar_url:
            typeof member.avatar_url === 'string' ? member.avatar_url : '',
          is_following: member.is_following === true,
        },
      },
      child_comment_count:
        typeof value.child_comment_count === 'number'
          ? value.child_comment_count
          : 0,
      child_comments: [],
      vote_count: typeof value.vote_count === 'number' ? value.vote_count : 0,
      relationship: { voting: relationship?.voting === 1 ? 1 : 0 },
      address_text:
        typeof value.address_text === 'string' ? value.address_text : undefined,
      can_delete: value.can_delete === true,
      allow_delete: value.allow_delete === true,
      is_author: value.is_author === true,
      author_tag: normalizeCommentTags(value.author_tag),
      comment_tag: normalizeCommentTags(value.comment_tag),
    };
  } catch {
    return null;
  }
}
