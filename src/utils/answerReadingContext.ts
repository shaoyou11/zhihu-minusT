import type { ZhihuNextRenderScene } from '@/api/zhihu/nextRender';

/** Navigation origin is independent of the answer's own question metadata. */
export interface AnswerReadingContext {
  scene: ZhihuNextRenderScene;
  memberId?: string;
  memberSort?: 'created' | 'voteups';
}

export interface AnswerReadingRouteParams {
  answerScene?: string;
  memberId?: string;
  memberSort?: string;
}

export function getAnswerReadingContext(
  params: { [Key in keyof AnswerReadingRouteParams]?: unknown },
): AnswerReadingContext {
  const scene =
    params.answerScene === 'profile_answer' ||
    params.answerScene === 'question_feed' ||
    params.answerScene === 'recommend'
      ? params.answerScene
      : 'unknown';
  if (scene !== 'profile_answer') return { scene };
  const memberId =
    typeof params.memberId === 'string' ? params.memberId.trim() : '';
  return {
    scene,
    ...(memberId ? { memberId } : {}),
    memberSort: params.memberSort === 'voteups' ? 'voteups' : 'created',
  };
}

export function getAnswerReadingRouteParams(
  context?: AnswerReadingContext,
): AnswerReadingRouteParams {
  if (!context) return { answerScene: 'unknown' };
  return {
    answerScene: context.scene,
    ...(context.scene === 'profile_answer'
      ? { memberId: context.memberId, memberSort: context.memberSort }
      : {}),
  };
}

/** A user's activity can reference someone else's answer; keep its true origin. */
export function getProfileAnswerReadingContext(
  author: { id?: string; url_token?: string },
  member: { id?: string; url_token?: string },
  memberId: string,
  memberSort: 'created' | 'voteups' = 'created',
): AnswerReadingContext {
  const sameAuthor = Boolean(
    (author.id && member.id && author.id === member.id) ||
      (author.url_token &&
        member.url_token &&
        author.url_token === member.url_token) ||
      (author.id && author.id === memberId) ||
      (author.url_token && author.url_token === memberId),
  );
  return sameAuthor
    ? { scene: 'profile_answer', memberId, memberSort }
    : { scene: 'unknown' };
}
