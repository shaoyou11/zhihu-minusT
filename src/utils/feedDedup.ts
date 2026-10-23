const LOCAL_FEED_DEDUP_TABS = new Set(['recommend', 'local']);

export function supportsLocalFeedDedup(tab: string): boolean {
  return LOCAL_FEED_DEDUP_TABS.has(tab);
}
