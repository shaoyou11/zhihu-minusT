import { isPlayableVideoUrl, parseZhihuVideoReference } from './zhihuVideo';

export interface ZhihuVideoRouteInput {
  lensId?: string;
  videoId?: string;
  url?: string;
  resourceUrl?: string;
  title?: string;
}

function numericId(value: string | undefined): string | undefined {
  const id = value?.trim();
  return id && /^\d+$/.test(id) ? id : undefined;
}

/** Direct resources must be media URLs, never a page or local file. */
export function getDirectZhihuVideoUrl(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return isPlayableVideoUrl(url.href) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function videoPage(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim(), 'https://www.zhihu.com');
    const reference = parseZhihuVideoReference(url.href);
    return reference ? { id: reference.id, source: reference.kind } : undefined;
  } catch {
    return undefined;
  }
}

/** Lens identity wins over a zvideo page ID and expiring direct resources. */
export function getZhihuVideoRoute(
  input: ZhihuVideoRouteInput,
): string | undefined {
  const lensId = numericId(input.lensId);
  const page = videoPage(input.url);
  const videoId = numericId(input.videoId);
  const identity = lensId
    ? { id: lensId, source: 'lens' }
    : (page ?? (videoId ? { id: videoId, source: 'zvideo' } : undefined));
  const uri = identity
    ? undefined
    : (getDirectZhihuVideoUrl(input.resourceUrl) ??
      getDirectZhihuVideoUrl(input.url));
  if (!identity && !uri) return undefined;
  const query = new URLSearchParams({ source: identity?.source ?? 'direct' });
  if (uri) query.set('uri', uri);
  if (input.title?.trim()) query.set('title', input.title.trim().slice(0, 200));
  return `zhihu--:///video/${identity?.id ?? 'direct'}?${query}`;
}
