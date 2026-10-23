import type { ZhihuNotificationItem } from '@/types/zhihu';
import { parseZhihuUrl } from './url';

export function getNotificationBody(item: ZhihuNotificationItem): string {
  const content = item.content;
  if (typeof content === 'string') return content || '新的动态';
  return (
    content?.extend?.text ||
    content?.text ||
    content?.title ||
    content?.sub_text ||
    content?.target?.text ||
    content?.target?.title ||
    item.target?.content ||
    item.target?.text ||
    item.target?.title ||
    '新的动态'
  );
}

export function getNotificationPath(
  item: ZhihuNotificationItem,
): string | null {
  const content = typeof item.content === 'object' ? item.content : undefined;
  const target = content?.target || item.target;
  for (const link of [target?.link, target?.url]) {
    const path = parseZhihuUrl(link || null);
    if (path) return path;
  }
  if (target?.id === undefined || target.id === null) return null;
  const type = target.type;
  if (type === 'member' || type === 'people') {
    return parseZhihuUrl(`/people/${target.id}`);
  }
  return parseZhihuUrl(`/${type}/${target.id}`);
}
