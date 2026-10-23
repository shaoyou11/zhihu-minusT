import type { ZhihuVideoSourceKind } from '@/types/zhihu';

const VIDEO_ID = /^\d+$/;
const VIDEO_PATH = /^\/(?:api\/v4\/)?(zvideos?|videos?)\/(\d+)\/?$/i;

export interface ZhihuVideoReference {
  id: string;
  kind: ZhihuVideoSourceKind;
}

// Normalize API object types before cards collapse them into the videos group.
export function getZhihuVideoSource(
  type: string | null | undefined,
): ZhihuVideoSourceKind | undefined {
  switch (type?.toLowerCase()) {
    case 'video':
    case 'videos':
      return 'lens';
    case 'zvideo':
    case 'zvideos':
      return 'zvideo';
    default:
      return undefined;
  }
}

function reference(type: string, id: string): ZhihuVideoReference {
  return { id, kind: type.toLowerCase().startsWith('z') ? 'zvideo' : 'lens' };
}

/** Keep long video identifiers as strings; numeric coercion loses precision. */
export function parseZhihuVideoId(value: string): string | null {
  return parseZhihuVideoReference(value)?.id ?? null;
}

/** A /video ID identifies Lens media; a /zvideo ID identifies a content page. */
export function parseZhihuVideoReference(
  value: string,
): ZhihuVideoReference | null {
  const candidate = value.trim();
  if (VIDEO_ID.test(candidate)) return { id: candidate, kind: 'lens' };

  let url: URL;
  try {
    url = new URL(
      candidate.startsWith('//') ? `https:${candidate}` : candidate,
    );
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;

  if (url.protocol === 'zhihu:') {
    if (!/^(?:zvideos?|videos?)$/i.test(url.hostname)) return null;
    const match = /^\/(\d+)\/?$/.exec(url.pathname);
    return match ? reference(url.hostname, match[1]) : null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hostname === 'lens.zhihu.com') {
    const id = /^\/(?:api\/v4\/videos|videos?)\/(\d+)\/?$/i.exec(
      url.pathname,
    )?.[1];
    return id ? { id, kind: 'lens' } : null;
  }
  if (
    url.hostname !== 'www.zhihu.com' &&
    url.hostname !== 'zhihu.com' &&
    url.hostname !== 'oia.zhihu.com' &&
    url.hostname !== 'api.zhihu.com'
  )
    return null;
  const match = VIDEO_PATH.exec(url.pathname);
  return match ? reference(match[1], match[2]) : null;
}

/** Recognize media resources without mistaking a Zhihu video page for a file. */
export function isPlayableVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      /\.(?:mp4|m3u8|m4v|mov|webm)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
