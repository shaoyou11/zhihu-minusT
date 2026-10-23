/** Preserve virtual feed entry points; only HTTP feeds accept refresh parameters. */
export function getFeedRequestUrl(
  pageParam: string,
  initialUrl: string,
  refreshing: boolean,
  now = Date.now(),
): string {
  if (!refreshing || !/^https?:\/\//.test(pageParam)) return pageParam;
  const isInitialUrl =
    (pageParam === initialUrl ||
      pageParam.includes('feed/topstory/recommend')) &&
    !pageParam.includes('action=down');
  if (!isInitialUrl) return pageParam;
  const separator = pageParam.includes('?') ? '&' : '?';
  return `${pageParam}${separator}action=up&t=${now}`;
}

export function getFeedNextUrl(paging?: {
  is_end?: boolean;
  next?: string;
}): string | null {
  if (paging?.is_end || !paging?.next) return null;
  return paging.next.replace(/^http:\/\//, 'https://');
}

export function getNextUnvisitedFeedPage(
  nextUrl: string | null,
  pageParams: readonly unknown[],
): string | undefined {
  return nextUrl && !pageParams.includes(nextUrl) ? nextUrl : undefined;
}
