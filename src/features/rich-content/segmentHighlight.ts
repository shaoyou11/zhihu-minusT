import type {
  ZhihuSegmentHighlightMetadata,
  ZhihuSegmentHighlightReaction,
} from './document';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAttribute(
  attributes: Record<string, unknown>,
  name: string,
): string | undefined {
  if (!Object.hasOwn(attributes, name)) return undefined;
  const value = attributes[name];
  return typeof value === 'string' ? value : undefined;
}

function nonemptyTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0 || /[^0-9]/.test(value)) {
    return undefined;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
}

/**
 * 仅投影 highlight-wrap 已知的业务属性；空元数据仍代表视觉知识点高亮。
 * sourceUrl 尚未验证为可导航 URL，使用前须经过导航层的 URL 校验。
 */
export function parseZhihuSegmentHighlight(
  attributes: unknown,
): ZhihuSegmentHighlightMetadata | null {
  if (!isRecord(attributes)) return null;
  const className = readAttribute(attributes, 'class');
  if (!className?.split(/[\t\n\f\r ]+/).includes('highlight-wrap')) {
    return null;
  }

  const attribute = (name: string): string | undefined =>
    readAttribute(attributes, `data-highlight-${name}`);
  const segmentIds = Array.from(
    new Set(
      (attribute('id') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  );
  const displayText = attribute('display-text');
  const sourceUrl = nonemptyTrimmed(attribute('source-url'));
  const isSpan = parseBoolean(attribute('is-span'));
  const likeCount = parseCount(attribute('like-count'));
  const commentCount = parseCount(attribute('comment-count'));
  const myCommentCount = parseCount(attribute('my-comment-count'));
  const isLiked = parseBoolean(attribute('is-like'));
  const reaction: ZhihuSegmentHighlightReaction = {
    ...(likeCount !== undefined && { likeCount }),
    ...(commentCount !== undefined && { commentCount }),
    ...(myCommentCount !== undefined && { myCommentCount }),
    ...(isLiked !== undefined && { isLiked }),
  };
  const contentId = nonemptyTrimmed(attribute('content-id'));
  const contentType = attribute('content-type');
  const paragraphId = nonemptyTrimmed(attribute('pid'));
  const start = parseCount(attribute('start-offset'));
  const end = parseCount(attribute('end-offset'));

  return {
    ...(segmentIds.length > 0 && { segmentIds }),
    ...(displayText?.trim() && { displayText }),
    ...(sourceUrl !== undefined && { sourceUrl }),
    ...(isSpan !== undefined && { isSpan }),
    ...(Object.keys(reaction).length > 0 && { reaction }),
    ...(contentId !== undefined &&
      (contentType === 'answer' || contentType === 'article') && {
        target: { contentId, contentType },
      }),
    ...(paragraphId !== undefined &&
      start !== undefined &&
      end !== undefined &&
      end > start && {
        location: { paragraphId, range: { start, end } },
      }),
  };
}
