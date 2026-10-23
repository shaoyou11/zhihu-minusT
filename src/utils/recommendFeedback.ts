import type { InfiniteData } from '@tanstack/react-query';
import type { RecommendFeedbackTarget } from '@/api/zhihu/feed';
import { type FeedIdentitySource, getFeedContentKey } from './feedIdentity';

export function getRecommendFeedbackTarget(
  item: FeedIdentitySource,
): RecommendFeedbackTarget | null {
  const id = item.id?.toString().trim();
  if (!id || item.isIdStable === false) return null;
  if (item.type !== 'answers' && item.type !== 'articles') return null;
  return { id, type: item.type };
}

export function removeRecommendationFromPages<
  TPage extends { items: FeedIdentitySource[] },
>(
  data: InfiniteData<TPage, string> | undefined,
  contentKey: string,
): InfiniteData<TPage, string> | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.filter(
      (item) => getFeedContentKey(item) !== contentKey,
    );
    if (items.length === page.items.length) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}
