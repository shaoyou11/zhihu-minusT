import type { RecentMomentItem } from '@/api/zhihu/moments';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

/** Validate foreign/cache data before rendering or using it for navigation. */
export function normalizeRecentMoments(value: unknown): RecentMomentItem[] {
  if (!Array.isArray(value)) return [];
  const items: RecentMomentItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.actor)) continue;
    const actor = item.actor;
    const unreadCount = item.unread_count ?? 0;
    if (
      typeof actor.id !== 'string' ||
      actor.id.trim().length === 0 ||
      !isOptionalString(actor.url_token) ||
      !isOptionalString(actor.name) ||
      !isOptionalString(actor.avatar_url) ||
      typeof unreadCount !== 'number' ||
      !Number.isSafeInteger(unreadCount) ||
      unreadCount < 0
    ) {
      continue;
    }
    items.push({
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      ...(typeof item.brief === 'string' ? { brief: item.brief } : {}),
      actor: {
        id: actor.id,
        url_token: actor.url_token ?? '',
        name: actor.name ?? '',
        avatar_url: actor.avatar_url ?? '',
      },
      unread_count: unreadCount,
    });
  }
  return items;
}
