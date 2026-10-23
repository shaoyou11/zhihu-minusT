import type {
  AnswerPublishInfo,
  ZhihuReadingPreviewItem,
} from '@/api/zhihu/answerPreview';
import { formatDate } from './date';

function questionKey(item: ZhihuReadingPreviewItem): string {
  return item.type === 'answer' ? item.question.id || item.question.title : '';
}

/**
 * A preview card repeats its question title only when the question changes.
 * Inside a question feed the page context already names the first question.
 */
export function shouldShowPreviewQuestion(
  items: readonly ZhihuReadingPreviewItem[],
  index: number,
  contextQuestionId?: string,
): boolean {
  const item = items[index];
  if (item?.type !== 'answer') return false;
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    if (items[previous].type === 'answer')
      return questionKey(items[previous]) !== questionKey(item);
  }
  return !contextQuestionId || item.question.id !== contextQuestionId;
}

function timestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function label(value: unknown, prefix: string, labelled: RegExp): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return !text || labelled.test(text) ? text : `${prefix}${text}`;
}

function compact(info: AnswerPublishInfo): AnswerPublishInfo | undefined {
  const entries = Object.entries(info).filter(([, value]) => value);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Same wording as the answer detail page; an unchanged edit date is omitted. */
export function getAnswerPublishInfo(source: {
  created_time?: unknown;
  updated_time?: unknown;
  ip_info?: unknown;
}): AnswerPublishInfo | undefined {
  const created = timestamp(source.created_time);
  const updated = timestamp(source.updated_time);
  const createdDate = created ? formatDate(created) : '';
  const updatedDate = updated ? formatDate(updated) : '';
  return compact({
    published: createdDate ? `发布于 ${createdDate}` : '',
    edited:
      updatedDate && updatedDate !== createdDate ? `编辑于 ${updatedDate}` : '',
    location: label(source.ip_info, 'IP 属地', /^IP/i),
  });
}

/**
 * next-render sends display text such as `2026-09-18 15:27`,
 * `编辑于 2026-09-18 17:29` and `天津`; add the labels the bare values lack.
 */
export function getNextRenderPublishInfo(
  endInfo: Record<string, unknown> | undefined,
): AnswerPublishInfo | undefined {
  return compact({
    published: label(endInfo?.create_time_text, '发布于 ', /^发布/),
    edited: label(endInfo?.update_time_text, '编辑于 ', /^编辑/),
    location: label(endInfo?.ip_info, 'IP 属地', /^IP/i),
  });
}

/** Publish time and location share the first line; the edit time gets its own. */
export function formatAnswerPublishInfo(info: AnswerPublishInfo): string[] {
  return [
    [info.published, info.location].filter(Boolean).join(' · '),
    info.edited ?? '',
  ].filter(Boolean);
}
