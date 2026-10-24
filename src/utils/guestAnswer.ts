import type { QueryClient } from '@tanstack/react-query';
import type { AnswerDetail } from '@/api/zhihu/answer';
import type { ZhihuPlainPreviewAnswer } from '@/api/zhihu/nextRender';
import { getAuthSessionVersion } from '@/store/useAuthStore';

/** Public card bodies can be partial; never put them in the full-detail cache. */
export function getGuestAnswerKey(answerId: string, sessionVersion: number) {
  return ['guest-answer', sessionVersion, answerId] as const;
}

export function mergeGuestAnswer(
  previous: AnswerDetail | undefined,
  answer: AnswerDetail,
): AnswerDetail {
  if (
    previous &&
    !previous.content_need_truncated &&
    answer.content_need_truncated
  )
    return previous;
  return {
    ...answer,
    question: answer.question
      ? {
          ...answer.question,
          title: answer.question.title || previous?.question?.title || '',
        }
      : previous?.question,
  };
}

/** Clicked Feed/profile cards already keep their public text in a scoped cache. */
export function guestAnswerFromPreview(
  entry: ZhihuPlainPreviewAnswer | undefined,
): AnswerDetail | undefined {
  if (!entry || typeof entry.content !== 'string' || !entry.content.trim())
    return undefined;
  return {
    id: entry.id,
    type: 'answer',
    content: entry.content,
    excerpt: entry.excerpt,
    author: { ...entry.author, type: 'people' },
    question: { ...entry.question, type: 'question' },
    voteup_count: entry.voteup_count,
    comment_count: entry.comment_count,
    favlists_count: entry.favlists_count,
    relationship: entry.relationship,
    created_time: 0,
    created_time_name: entry.publishInfo?.published?.replace(/^发布于\s*/, ''),
    ip_info: entry.publishInfo?.location,
    segment_infos: entry.segmentInfos ? [...entry.segmentInfos] : undefined,
    link_card_info: entry.linkCardInfo
      ? Object.fromEntries(
          Object.entries(entry.linkCardInfo).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    content_need_truncated: entry.contentNeedTruncated,
    answer_type: entry.answerType,
  };
}

export function seedGuestAnswerFromList(
  client: QueryClient,
  answer: AnswerDetail,
  sessionVersion: number,
): void {
  if (
    sessionVersion !== getAuthSessionVersion() ||
    !String(answer.id).trim() ||
    !answer.content?.trim()
  )
    return;
  client.setQueryData<AnswerDetail>(
    getGuestAnswerKey(String(answer.id), sessionVersion),
    (previous) => mergeGuestAnswer(previous, answer),
  );
}
