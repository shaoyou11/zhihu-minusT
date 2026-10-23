import type {
  ZhihuContentSegment,
  ZhihuSegmentInfo,
  ZhihuStructuredContent,
} from '@/types/zhihu';
import type { RichContentVariant } from '../imagePolicy';
import { parseZhihuStructuredContent } from '../structuredContent';
import type { RichContentObjectType } from '../types';

type JsonRecord = Record<string, unknown>;
type PinContentRecord = JsonRecord & { type: string };

interface FixtureManifestCase {
  id: string;
  file: string;
  sourceType: string;
  contentPath: string;
  collectedAt?: string;
  traits: string[];
  expected: Record<string, number>;
}

export type RichContentFixtureSummary = FixtureManifestCase;

export interface RichContentDevFixture extends RichContentFixtureSummary {
  content: string;
  contentArray?: ZhihuContentSegment[];
  structuredContent?: ZhihuStructuredContent;
  linkCardInfo?: JsonRecord;
  objectId: string;
  rendererType: RichContentObjectType;
  variant: RichContentVariant;
  segmentInfos?: ZhihuSegmentInfo[];
  title?: string;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requireString(record: JsonRecord, key: string, context: string) {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value ? value : undefined;
}

function parseExpected(value: unknown, context: string) {
  if (value === undefined) return {};
  const expected = asRecord(value);
  if (!expected) throw new Error(`${context}.expected must be an object`);

  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(expected)) {
    if (typeof count !== 'number') {
      throw new Error(`${context}.expected.${key} must be a number`);
    }
    counts[key] = count;
  }
  return counts;
}

export function parseRichContentFixtureManifest(
  value: unknown,
): RichContentFixtureSummary[] {
  const manifest = asRecord(value);
  if (!manifest || !Array.isArray(manifest.cases)) {
    throw new Error('rich-content fixture manifest must contain cases[]');
  }

  const parsedCases = manifest.cases.map((rawCase: unknown, index: number) => {
    const context = `manifest.cases.${index}`;
    const entry = asRecord(rawCase);
    if (!entry) throw new Error(`${context} must be an object`);

    const traits = entry.traits;
    if (
      !Array.isArray(traits) ||
      !traits.every((item: unknown): item is string => typeof item === 'string')
    ) {
      throw new Error(`${context}.traits must be a string array`);
    }

    return {
      id: requireString(entry, 'id', context),
      file: requireString(entry, 'file', context),
      sourceType: requireString(entry, 'sourceType', context),
      contentPath: requireString(entry, 'contentPath', context),
      collectedAt: optionalString(entry, 'collectedAt'),
      traits,
      expected: parseExpected(entry.expected, context),
    };
  });

  const ids = new Set<string>();
  for (const fixtureCase of parsedCases) {
    if (ids.has(fixtureCase.id)) {
      throw new Error(`duplicate rich-content fixture id: ${fixtureCase.id}`);
    }
    ids.add(fixtureCase.id);
  }
  return parsedCases;
}

function getPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function unwrapModule(value: unknown): unknown {
  const moduleRecord = asRecord(value);
  return moduleRecord && 'default' in moduleRecord
    ? moduleRecord.default
    : value;
}

function getRendererType(
  sourceType: string,
  entity: JsonRecord,
): RichContentObjectType {
  if (sourceType === 'daily') return 'article';
  const entityType = entity.type;
  if (
    entityType === 'answer' ||
    entityType === 'article' ||
    entityType === 'pin' ||
    entityType === 'question'
  ) {
    return entityType;
  }
  if (sourceType === 'question_feed_card') return 'answer';
  throw new Error(`unsupported rich-content fixture type: ${sourceType}`);
}

function isSegmentReactionInfo(
  value: unknown,
): value is NonNullable<ZhihuSegmentInfo['marks'][number]['seg_info']> {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.like_count === 'number' &&
    typeof record.comment_count === 'number' &&
    typeof record.is_like === 'boolean' &&
    (record.seg_ids === undefined ||
      (typeof record.seg_ids === 'string' && record.seg_ids.length > 0) ||
      (Array.isArray(record.seg_ids) &&
        record.seg_ids.every(
          (id: unknown) => typeof id === 'string' && id.length > 0,
        )))
  );
}

function isSegmentInfo(value: unknown): value is ZhihuSegmentInfo {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.pid !== 'string' ||
    typeof record.text !== 'string' ||
    !Array.isArray(record.marks)
  ) {
    return false;
  }
  const textLength = record.text.length;

  return record.marks.every((mark: unknown) => {
    const markRecord = asRecord(mark);
    if (!markRecord) return false;
    const startIndex = markRecord.start_index;
    const endIndex = markRecord.end_index;
    const hasInteraction =
      isSegmentReactionInfo(markRecord.seg_info) ||
      isSegmentReactionInfo(markRecord.master_seg_info);
    return (
      typeof startIndex === 'number' &&
      Number.isInteger(startIndex) &&
      typeof endIndex === 'number' &&
      Number.isInteger(endIndex) &&
      startIndex >= 0 &&
      endIndex >= startIndex &&
      endIndex <= textLength &&
      hasInteraction &&
      (markRecord.seg_info === undefined ||
        isSegmentReactionInfo(markRecord.seg_info)) &&
      (markRecord.master_seg_info === undefined ||
        isSegmentReactionInfo(markRecord.master_seg_info))
    );
  });
}

function getParagraphIds(content: string) {
  return new Set(
    Array.from(
      content.matchAll(/<p\b[^>]*\bdata-pid=(?:"([^"]+)"|'([^']+)')[^>]*>/gi),
      (match) => match[1] ?? match[2],
    ),
  );
}

function getSegmentInfos(
  entity: JsonRecord,
  content: string,
): ZhihuSegmentInfo[] | undefined {
  const value = entity.segment_infos;
  if (!Array.isArray(value)) return undefined;
  if (!value.every(isSegmentInfo)) {
    throw new Error('fixture segment_infos contains an invalid segment');
  }

  const paragraphIds = getParagraphIds(content);
  const segmentPids = new Set<string>();
  for (const segment of value) {
    if (segmentPids.has(segment.pid)) {
      throw new Error(
        `fixture segment_infos contains duplicate pid: ${segment.pid}`,
      );
    }
    if (!paragraphIds.has(segment.pid)) {
      throw new Error(
        `fixture segment pid is absent from content: ${segment.pid}`,
      );
    }
    segmentPids.add(segment.pid);
  }
  return value;
}

function getObjectId(entity: JsonRecord, fixtureId: string): string {
  const id = entity.id;
  return typeof id === 'string' || typeof id === 'number'
    ? String(id)
    : `fixture-${fixtureId}`;
}

function getFixtureTitle(root: JsonRecord, entity: JsonRecord) {
  const rootTitle = optionalString(root, 'title');
  if (rootTitle) return rootTitle;

  const question = asRecord(entity.question);
  return question ? optionalString(question, 'title') : undefined;
}

/** 将已脱敏的开发 fixture 解码为渲染输入，不依赖 Metro 的模块加载。 */
export function decodeRichContentDevFixture(
  summary: RichContentFixtureSummary,
  rawFixtureModule: unknown,
): RichContentDevFixture {
  const rawFixture = unwrapModule(rawFixtureModule);
  const root = asRecord(rawFixture);
  if (!root) throw new Error(`fixture must be a JSON object: ${summary.file}`);

  const content = getPath(root, summary.contentPath);
  if (summary.sourceType === 'structured_content') {
    const parentPath = summary.contentPath.split('.').slice(0, -1).join('.');
    const entity = (parentPath && asRecord(getPath(root, parentPath))) || root;
    return {
      ...summary,
      content: '',
      structuredContent: parseZhihuStructuredContent(content),
      objectId: getObjectId(entity, summary.id),
      rendererType: 'answer',
      variant: 'default',
      title: getFixtureTitle(root, entity),
    };
  }
  if (typeof content !== 'string') {
    throw new Error(
      `fixture contentPath must resolve to a string: ${summary.contentPath}`,
    );
  }

  const entity =
    summary.sourceType === 'question_feed_card' ? asRecord(root.target) : root;
  if (!entity) throw new Error(`fixture entity not found: ${summary.id}`);

  const contentArray =
    summary.sourceType === 'pin' && Array.isArray(root.content)
      ? root.content
          .filter((item: unknown): item is PinContentRecord => {
            const record = asRecord(item);
            return (
              record !== null &&
              typeof record.type === 'string' &&
              record.type.trim().length > 0
            );
          })
          .map(
            (item): ZhihuContentSegment => ({
              type: item.type,
              ...(typeof item.content === 'string' && {
                content: item.content,
              }),
              ...(typeof item.url === 'string' && { url: item.url }),
              ...(typeof item.width === 'number' &&
                Number.isFinite(item.width) &&
                item.width > 0 && { width: item.width }),
              ...(typeof item.height === 'number' &&
                Number.isFinite(item.height) &&
                item.height > 0 && { height: item.height }),
              ...(typeof item.duration === 'number' &&
                Number.isFinite(item.duration) &&
                item.duration >= 0 && { duration: item.duration }),
              ...(typeof item.title === 'string' && { title: item.title }),
              ...(typeof item.thumbnail === 'string' && {
                thumbnail: item.thumbnail,
              }),
              ...(typeof item.video_id === 'string' && {
                video_id: item.video_id,
              }),
              ...(typeof item.video_bo_id === 'string' && {
                video_bo_id: item.video_bo_id,
              }),
              ...(typeof item.data_draft_title === 'string' && {
                data_draft_title: item.data_draft_title,
              }),
              ...(typeof item.data_draft_cover === 'string' && {
                data_draft_cover: item.data_draft_cover,
              }),
            }),
          )
      : undefined;

  return {
    ...summary,
    content,
    contentArray,
    linkCardInfo: asRecord(entity.link_card_info) ?? undefined,
    objectId: getObjectId(entity, summary.id),
    rendererType: getRendererType(summary.sourceType, entity),
    variant: summary.sourceType === 'daily' ? 'daily' : 'default',
    segmentInfos: getSegmentInfos(entity, content),
    title: getFixtureTitle(root, entity),
  };
}
