import type { ZhihuPinDetail } from '@/types/zhihu';
import client, { type ApiRequestOptions } from '../client';
import type { UploadedImage } from './image';
import {
  createPublishingTraceId,
  getPublishingTextLength,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';

interface PinDraftResponse {
  code?: number;
  data?: {
    content_id?: string | number;
  };
}

export interface PinMediaImage {
  height: number;
  originalUrl: string;
  url: string;
  watermark: string;
  watermarkUrl: string;
  width: number;
}

export interface PinPublishOptions {
  images?: UploadedImage[];
  pinId?: string | number;
  draftId?: string;
  sourceData?: Record<string, unknown>;
  title?: string;
}

export interface PinDraft {
  id: string;
  html: string;
  title: string;
  images: UploadedImage[];
  sourceData: Record<string, unknown>;
}

interface PinContentData extends Record<string, unknown> {
  commentsPermission: { comment_permission: 'all' };
  extra_info: { publisher: 'pc'; view_permission: 'all' };
  hybrid: { html: string; textLength: number };
  media: { medias: Array<{ image: PinMediaImage }> };
  publish: { traceId: string };
  title: { title: string };
}

export const getPin = async (
  id: string | number,
  options: ApiRequestOptions = {},
): Promise<ZhihuPinDetail> => {
  const include =
    'author,author.is_following,content,content_html,created,like_count,reaction_count,reaction,virtuals,comment_count,relationship.voting,topics';
  const res = await client.get<ZhihuPinDetail>(
    `/pins/${id}?include=${include}`,
    { signal: options.signal },
  );
  return res.data;
};

export const votePinPoll = async (
  pollId: string | number,
  optionIds: Array<string | number>,
) => {
  const res = await client.post(`/polls/${pollId}`, {
    options: optionIds.map(String),
  });
  return res.data;
};

function toPinMediaImage(image: UploadedImage): PinMediaImage {
  return {
    height: image.height,
    width: image.width,
    url: image.src,
    originalUrl: image.originalSrc ?? image.src,
    watermark: image.watermark ?? 'watermark',
    watermarkUrl: image.watermarkSrc ?? image.src,
  };
}

function createPinContentData(
  html: string,
  traceId: string,
  options: PinPublishOptions,
): PinContentData {
  const sourceMedias = record(options.sourceData?.media)?.medias;
  const remainingMedias = Array.isArray(sourceMedias) ? [...sourceMedias] : [];
  return {
    ...options.sourceData,
    publish: { ...record(options.sourceData?.publish), traceId },
    commentsPermission: {
      comment_permission: 'all',
      ...record(options.sourceData?.commentsPermission),
    },
    extra_info: {
      view_permission: 'all',
      publisher: 'pc',
      ...record(options.sourceData?.extra_info),
    },
    title: {
      ...record(options.sourceData?.title),
      title: options.title?.trim() ?? '',
    },
    hybrid: {
      ...record(options.sourceData?.hybrid),
      html,
      textLength: getPublishingTextLength(html),
    },
    media: {
      ...record(options.sourceData?.media),
      medias: (options.images ?? []).map((image) => {
        const sourceIndex = remainingMedias.findIndex(
          (entry) => record(record(entry)?.image)?.url === image.src,
        );
        const original =
          sourceIndex >= 0
            ? record(remainingMedias.splice(sourceIndex, 1)[0])
            : null;
        return {
          ...original,
          image: { ...record(original?.image), ...toPinMediaImage(image) },
        };
      }),
    },
  };
}

export async function savePinDraft(
  html: string,
  options: PinPublishOptions = {},
): Promise<string> {
  const existingId = options.pinId ?? options.draftId;
  const response = await client.post<PinDraftResponse>(
    'https://api.zhihu.com/content/drafts',
    {
      action: 'pin',
      data: {
        ...createPinContentData(html, createPublishingTraceId(), options),
        draft: {
          disabled: 1,
          ...(existingId !== undefined
            ? {
                id: String(existingId),
                isPublished: options.pinId !== undefined,
              }
            : {}),
        },
      },
    },
  );
  if (response.data.code !== undefined && response.data.code !== 0)
    throw new Error('想法草稿保存失败，请重试');
  const draftId = response.data.data?.content_id ?? existingId;
  if (draftId === undefined || draftId === null || draftId === '') {
    throw new Error('知乎没有返回想法草稿 ID');
  }
  return String(draftId);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function parsePinDraft(response: unknown, expectedId: string): PinDraft {
  const envelope = record(response);
  const data = record(envelope?.data);
  if (
    envelope?.code !== 0 ||
    data?.object_type !== 'pin' ||
    String(data.content_id) !== expectedId
  )
    throw new Error('知乎返回了无效的想法草稿');
  const raw = data.draft_plugin || data.online_plugin;
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  } catch {
    throw new Error('想法草稿格式暂不支持，请使用官方编辑器');
  }
  const sourceData = record(parsed);
  const hybrid = record(sourceData?.hybrid);
  const title = record(sourceData?.title);
  const media = record(sourceData?.media);
  if (
    !sourceData ||
    typeof hybrid?.html !== 'string' ||
    typeof title?.title !== 'string' ||
    !Array.isArray(media?.medias)
  )
    throw new Error('想法草稿内容不完整，请使用官方编辑器');
  const images: UploadedImage[] = media.medias.map((rawMedia, index) => {
    const item = record(rawMedia);
    const image = record(item?.image);
    if (
      !item ||
      Object.keys(item).some((key) => key !== 'image' && key !== 'mediaType') ||
      (item.mediaType !== undefined && item.mediaType !== 'Picture') ||
      !image ||
      !isImageUrl(image.url) ||
      typeof image.width !== 'number' ||
      !Number.isFinite(image.width) ||
      image.width <= 0 ||
      typeof image.height !== 'number' ||
      !Number.isFinite(image.height) ||
      image.height <= 0 ||
      !isImageUrl(image.originalUrl) ||
      !isImageUrl(image.watermarkUrl) ||
      typeof image.watermark !== 'string'
    )
      throw new Error('此想法包含暂不支持的媒体，请使用官方编辑器');
    return {
      imageId: `pin-${expectedId}-${index}`,
      src: image.url,
      width: image.width,
      height: image.height,
      originalSrc: image.originalUrl,
      watermark: image.watermark,
      watermarkSrc: image.watermarkUrl,
    };
  });
  return {
    id: expectedId,
    html: hybrid.html,
    title: title.title,
    images,
    sourceData,
  };
}

export async function getPinDraft(
  id: string,
  options: ApiRequestOptions = {},
): Promise<PinDraft> {
  const response = await client.get<unknown>(
    `https://www.zhihu.com/content/plugin/${encodeURIComponent(id)}?action=pin`,
    { signal: options.signal },
  );
  return parsePinDraft(response.data, id);
}

export async function deletePin(id: string | number): Promise<void> {
  await client.delete<unknown>(`/pins/${encodeURIComponent(String(id))}`);
}

/**
 * Publish a new pin, or update an existing pin when `pinId` is provided.
 * Unlike articles and answers, pin images must live in `data.media.medias`.
 */
export const createPin = async (
  html: string,
  options: PinPublishOptions = {},
): Promise<PublishedContentResult> => {
  const traceId = createPublishingTraceId();
  const isPublished = options.pinId !== undefined;
  const draftId = isPublished
    ? String(options.pinId)
    : (options.draftId ?? (await savePinDraft(html, options)));

  const response = await client.post('/content/publish', {
    action: 'pin',
    data: {
      ...createPinContentData(html, traceId, options),
      draft: { disabled: 1, id: draftId, isPublished },
    },
  });
  return parsePublishedContentResult(response.data);
};

export const updatePin = async (
  pinId: string | number,
  html: string,
  options: Omit<PinPublishOptions, 'pinId'> = {},
): Promise<PublishedContentResult> => createPin(html, { ...options, pinId });
