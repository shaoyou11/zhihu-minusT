import type { DailyPage, DailyStory } from '@/api/zhihu/daily';

export type DailyListItem =
  | { type: 'date'; date: string }
  | { type: 'story'; data: DailyStory };

export function getDailyNextPageParam(
  page: DailyPage,
  pageParams: readonly string[],
): string | undefined {
  if (!page.date || !/^\d{8}$/.test(page.date)) return undefined;
  if (pageParams.includes(page.date) || !page.stories?.length) return undefined;
  return page.date;
}

export function flattenDailyPages(
  pages: readonly DailyPage[],
): DailyListItem[] {
  const items: DailyListItem[] = [];
  const seenStories = new Set<number>();
  const seenDates = new Set<string>();
  for (const page of pages) {
    const stories = (page.stories ?? []).filter((story) => {
      if (seenStories.has(story.id)) return false;
      seenStories.add(story.id);
      return true;
    });
    if (!stories.length) continue;
    if (page.date && !seenDates.has(page.date)) {
      items.push({ type: 'date', date: page.date });
      seenDates.add(page.date);
    }
    for (const story of stories) items.push({ type: 'story', data: story });
  }
  return items;
}
