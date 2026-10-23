import { Platform, Share } from 'react-native';
import { showToast } from '@/utils/toast';

export type ContentShareType =
  | 'answer'
  | 'question'
  | 'pin'
  | 'article'
  | 'video'
  | 'daily';

export interface ContentShareData {
  id: string | number;
  title?: string;
  author?: string;
  authorHeadline?: string;
  questionId?: string | number;
  url?: string;
  excerpt?: string;
  isCollected?: boolean;
}

const contentLabels: Record<ContentShareType, string> = {
  answer: '回答',
  question: '问题',
  pin: '想法',
  article: '文章',
  video: '视频',
  daily: '日报文章',
};

function validContentId(id: string | number | undefined): string {
  if (typeof id === 'number') {
    return Number.isSafeInteger(id) && id > 0 ? String(id) : '';
  }
  if (typeof id !== 'string') return '';
  const value = id.trim();
  return /^[1-9]\d*$/.test(value) ? value : '';
}

function publicShareUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      /^\/api(?:\/|$)/i.test(url.pathname) ||
      /(?:^|\.)api\./i.test(url.hostname) ||
      /\/(?:undefined|null|NaN)(?:\/|$)/.test(url.pathname)
    )
      return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** API object URLs are not public links; retain a usable canonical fallback. */
export function resolveContentShareUrl(
  type: ContentShareType,
  data: ContentShareData,
): string {
  const id = validContentId(data.id);
  if (!id) return '';
  const explicitUrl = publicShareUrl(data.url);
  if (explicitUrl) return explicitUrl;

  switch (type) {
    case 'answer': {
      const questionId = validContentId(data.questionId);
      return questionId
        ? `https://www.zhihu.com/question/${questionId}/answer/${id}`
        : `https://www.zhihu.com/answer/${id}`;
    }
    case 'question':
      return `https://www.zhihu.com/question/${id}`;
    case 'pin':
      return `https://www.zhihu.com/pin/${id}`;
    case 'article':
      return `https://zhuanlan.zhihu.com/p/${id}`;
    case 'video':
      return `https://www.zhihu.com/zvideo/${id}`;
    case 'daily':
      return `https://daily.zhihu.com/story/${id}`;
  }
}

function singleLine(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() || '';
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>~-]/g, '\\$&');
}

export function buildContentShareText(
  type: ContentShareType,
  data: ContentShareData,
  format: 'plain' | 'markdown',
): string {
  const url = resolveContentShareUrl(type, data);
  if (!url) return '';
  const title = singleLine(data.title) || `知乎${contentLabels[type]}`;
  const author = singleLine(data.author);
  const headline = singleLine(data.authorHeadline);
  const authorSuffix = headline ? `（${headline}）` : '';
  if (format === 'plain') {
    const authorLine = author
      ? `${author}${authorSuffix} 的${contentLabels[type]}`
      : '';
    return [title, authorLine, url].filter(Boolean).join('\n\n');
  }
  const authorLine = author
    ? `**${escapeMarkdown(author)}**${escapeMarkdown(authorSuffix)} 的${contentLabels[type]}`
    : '';
  return [`### ${escapeMarkdown(title)}`, authorLine, url]
    .filter(Boolean)
    .join('\n\n');
}

export async function shareContent(
  type: ContentShareType,
  data: ContentShareData,
  format: 'link' | 'information',
): Promise<void> {
  const url = resolveContentShareUrl(type, data);
  if (!url) {
    showToast('当前内容暂时无法分享');
    return;
  }
  const title = singleLine(data.title) || `知乎${contentLabels[type]}`;
  try {
    // iOS treats url and message as separate items. Keep the URL in one item.
    const content =
      format === 'link' && Platform.OS === 'ios'
        ? { url, title }
        : {
            message:
              format === 'information'
                ? buildContentShareText(type, data, 'plain')
                : url,
            title,
          };
    await Share.share(content, { subject: title, dialogTitle: title });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError'
    )
      return;
    showToast('分享失败，请稍后重试');
  }
}
