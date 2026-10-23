import type { Href } from 'expo-router';
import type {
  AddReadHistoryPayload,
  ReadHistoryDataItem,
} from '@/api/zhihu/history';

export function getReadHistoryPair(
  item: ReadHistoryDataItem,
): AddReadHistoryPayload | null {
  const extra = item.data?.extra;
  if (!extra?.content_token) return null;
  const type = extra.content_type;
  switch (type) {
    case 'answer':
    case 'question':
    case 'article':
    case 'pin':
    case 'zvideo':
    case 'video':
    case 'column':
    case 'profile':
      return { content_token: extra.content_token, content_type: type };
    default:
      return null;
  }
}

export function getReadHistoryKey(item: ReadHistoryDataItem): string {
  const pair = getReadHistoryPair(item);
  return pair
    ? `${pair.content_type}:${pair.content_token}`
    : `history:${item.id}`;
}

export function getReadHistoryRoute(item: ReadHistoryDataItem): Href | null {
  const pair = getReadHistoryPair(item);
  if (!pair) return null;
  const route =
    pair.content_type === 'profile'
      ? 'user'
      : pair.content_type === 'zvideo'
        ? 'video'
        : pair.content_type;
  return `/${route}/${encodeURIComponent(pair.content_token)}` as Href;
}

export function getSelectedReadHistoryPairs(
  items: ReadHistoryDataItem[],
  selectedKeys: ReadonlySet<string>,
): AddReadHistoryPayload[] {
  const pairs = new Map<string, AddReadHistoryPayload>();
  for (const item of items) {
    const key = getReadHistoryKey(item);
    if (!selectedKeys.has(key)) continue;
    const pair = getReadHistoryPair(item);
    if (pair) pairs.set(key, pair);
  }
  return [...pairs.values()];
}
