import type { ZhihuInvitationItem, ZhihuQuestion } from '@/types/zhihu';
import { parseZhihuUrl } from './url';

export type PublishingQuestionItem = ZhihuInvitationItem | ZhihuQuestion;

/** Resolve the same stable question ID for list identity and editor navigation. */
export function getPublishingQuestionId(
  item: PublishingQuestionItem,
): string | null {
  if ('content' in item && item.content?.text) {
    const path = parseZhihuUrl(item.content.target_link ?? '');
    return path?.match(/^\/question\/(\d+)$/)?.[1] ?? null;
  }
  const question =
    'id' in item && 'title' in item
      ? item
      : item.question || item.target || item.extra?.data;
  const id = question?.id == null ? '' : String(question.id);
  return /^\d+$/.test(id) ? id : null;
}
