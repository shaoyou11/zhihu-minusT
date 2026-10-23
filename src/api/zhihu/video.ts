import axios, { CanceledError } from 'axios';
import { parseZhihuVideoId } from '@/utils/zhihuVideo';
import apiClient, { type ApiRequestOptions } from '../client';

export interface ZhihuVideoSource {
  url: string;
  quality: string;
  format: 'mp4' | 'hls';
  playlist: 'playlist' | 'playlist_v2';
  width?: number;
  height?: number;
  duration?: number;
}

export interface ZhihuVideoDetail {
  id: string;
  title: string;
  coverUrl?: string;
  /** Runtime-only signed URLs, in playback preference order. */
  sources: readonly ZhihuVideoSource[];
}

const QUALITY_ORDER = ['FHD', 'HD', 'SD', 'LD'];
const INVALID_VIDEO_ID = '视频编号无效';
const NO_PLAYABLE_SOURCE = '视频暂无可播放资源';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const candidate = value.trim();
  try {
    const url = new URL(candidate);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    )
      return candidate;
  } catch {
    // Server input must never be included in diagnostics or feedback.
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeSource(
  quality: string,
  value: unknown,
  playlist: ZhihuVideoSource['playlist'],
): ZhihuVideoSource | undefined {
  const source = record(value);
  const url = mediaUrl(source?.play_url) ?? mediaUrl(source?.url);
  if (!source || !url) return undefined;
  const format =
    typeof source.format === 'string' ? source.format.toLowerCase() : '';
  const pathname = new URL(url).pathname;
  const normalizedFormat =
    format === 'mp4' || (!format && /\.mp4$/i.test(pathname))
      ? 'mp4'
      : format === 'm3u8' ||
          format === 'hls' ||
          (!format && /\.m3u8$/i.test(pathname))
        ? 'hls'
        : undefined;
  if (!normalizedFormat) return undefined;
  const width = positiveNumber(source.width);
  const height = positiveNumber(source.height);
  const duration = positiveNumber(source.duration);
  return {
    url,
    quality: quality.toUpperCase(),
    format: normalizedFormat,
    playlist,
    ...(width && { width }),
    ...(height && { height }),
    ...(duration && { duration }),
  };
}

function normalizePlaylist(
  value: unknown,
  playlist: ZhihuVideoSource['playlist'],
): ZhihuVideoSource[] {
  const entries = record(value);
  if (!entries) return [];
  const qualityRank = (quality: string) => {
    const rank = QUALITY_ORDER.indexOf(quality.toUpperCase());
    return rank < 0 ? QUALITY_ORDER.length : rank;
  };
  const qualities = Object.keys(entries).sort(
    (left, right) => qualityRank(left) - qualityRank(right),
  );
  return qualities.flatMap((quality) => {
    const source = normalizeSource(quality, entries[quality], playlist);
    return source ? [source] : [];
  });
}

/** Prefer the legacy AVC playlist before trying the newer HEVC renditions. */
export function normalizeZhihuVideoDetail(
  videoId: string,
  value: unknown,
): ZhihuVideoDetail {
  const id = parseZhihuVideoId(videoId);
  if (!id) throw new Error(INVALID_VIDEO_ID);
  const response = record(value);
  const seenUrls = new Set<string>();
  const sources = [
    ...normalizePlaylist(response?.playlist, 'playlist'),
    ...normalizePlaylist(response?.playlist_v2, 'playlist_v2'),
  ].filter((source) => {
    if (seenUrls.has(source.url)) return false;
    seenUrls.add(source.url);
    return true;
  });
  if (sources.length === 0) throw new Error(NO_PLAYABLE_SOURCE);
  const coverUrl =
    mediaUrl(response?.cover_url) ?? mediaUrl(response?.thumbnail);
  return {
    id,
    title: typeof response?.title === 'string' ? response.title : '',
    ...(coverUrl && { coverUrl }),
    sources,
  };
}

/** Lens is public; do not attach account cookies or Zhihu request signatures. */
export async function getZhihuVideo(
  videoId: string,
  options?: ApiRequestOptions,
): Promise<ZhihuVideoDetail> {
  const id = parseZhihuVideoId(videoId);
  if (!id) throw new Error(INVALID_VIDEO_ID);
  let data: unknown;
  try {
    const response = await axios.get<unknown>(
      `https://lens.zhihu.com/api/v4/videos/${id}`,
      { signal: options?.signal, timeout: 10000, withCredentials: false },
    );
    data = response.data;
  } catch (error) {
    if (axios.isCancel(error) || options?.signal?.aborted)
      throw new CanceledError('视频加载已取消');
    // Axios errors may contain the raw response and signed playback URLs.
    throw new Error('视频信息加载失败，请重试');
  }
  return normalizeZhihuVideoDetail(id, data);
}

function mediaIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  return undefined;
}

/** Resolve content-page IDs before asking Lens for their underlying media. */
export async function getZhihuVideoPlayback(
  videoId: string,
  kind: 'lens' | 'zvideo',
  options?: ApiRequestOptions,
): Promise<ZhihuVideoDetail> {
  if (kind === 'lens') return getZhihuVideo(videoId, options);
  const id = parseZhihuVideoId(videoId);
  if (!id) throw new Error(INVALID_VIDEO_ID);
  let data: unknown;
  try {
    const response = await apiClient.get<unknown>(`/zvideos/${id}`, {
      signal: options?.signal,
    });
    data = response.data;
  } catch (error) {
    if (axios.isCancel(error) || options?.signal?.aborted)
      throw new CanceledError('视频加载已取消');
    throw new Error('视频信息加载失败，请重试');
  }
  const response = record(data);
  const video = record(response?.video);
  const lensId = mediaIdentifier(video?.video_id) ?? mediaIdentifier(video?.id);
  const sources = [
    ...normalizePlaylist(video?.playlist, 'playlist'),
    ...normalizePlaylist(video?.playlist_v2, 'playlist_v2'),
  ];
  const detail = sources.length
    ? normalizeZhihuVideoDetail(lensId ?? id, video)
    : lensId
      ? await getZhihuVideo(lensId, options)
      : undefined;
  if (!detail) throw new Error(NO_PLAYABLE_SOURCE);
  return {
    ...detail,
    title:
      detail.title ||
      (typeof response?.title === 'string' ? response.title : ''),
  };
}
