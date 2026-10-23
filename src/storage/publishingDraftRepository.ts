import * as FileSystem from 'expo-file-system/legacy';
import type { LocalImageAsset } from '@/api/zhihu/image';
import type {
  PublishingBlock,
  PublishingDocument,
} from '@/features/publishing/document';
import type {
  PublishingDraftScope,
  PublishingDraftValue,
  PublishingMediaItem,
} from '@/features/publishing/types';
import { getSafeExternalUrl } from '@/utils/url';
import { localDatabase } from './localDatabase';

const MEDIA_ROOT = `${FileSystem.documentDirectory}publishing-media/`;
export const publishingDraftKey = (scope: PublishingDraftScope) =>
  `${scope.kind}:${scope.target}`;
const safeSegment = (value: string) =>
  Array.from(value)
    .map((character) => character.codePointAt(0)?.toString(16).padStart(6, '0'))
    .join('');
const accountDirectory = (accountKey: string) =>
  `${MEDIA_ROOT}${safeSegment(accountKey)}/`;
const mediaDirectory = (scope: PublishingDraftScope) =>
  `${accountDirectory(scope.accountKey)}${safeSegment(publishingDraftKey(scope))}/`;
const ownsAsset = (scope: PublishingDraftScope, uri: string) =>
  uri.startsWith(mediaDirectory(scope)) &&
  /^[a-zA-Z0-9_-]+\.image$/.test(uri.slice(mediaDirectory(scope).length));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeDocument(value: unknown): PublishingDocument | null {
  if (value === null) return null;
  const document = record(value);
  if (
    !document ||
    typeof document.originalHtml !== 'string' ||
    !Array.isArray(document.blocks)
  )
    return null;
  const blocks: PublishingBlock[] = [];
  for (const raw of document.blocks) {
    const block = record(raw);
    if (!block || typeof block.id !== 'string') return null;
    if (
      block.kind === 'preserved' &&
      typeof block.html === 'string' &&
      typeof block.visible === 'boolean'
    ) {
      blocks.push({
        id: block.id,
        kind: 'preserved',
        html: block.html,
        visible: block.visible,
      });
    } else if (
      block.kind === 'markdown' &&
      typeof block.value === 'string' &&
      typeof block.originalValue === 'string' &&
      typeof block.originalHtml === 'string'
    ) {
      blocks.push({
        id: block.id,
        kind: 'markdown',
        value: block.value,
        originalValue: block.originalValue,
        originalHtml: block.originalHtml,
      });
    } else return null;
  }
  return { originalHtml: document.originalHtml, blocks };
}

function normalizeImage(
  value: unknown,
): PublishingDraftValue['images'][number] | null {
  const image = record(value);
  if (
    !image ||
    typeof image.imageId !== 'string' ||
    typeof image.src !== 'string' ||
    !getSafeExternalUrl(image.src) ||
    typeof image.width !== 'number' ||
    typeof image.height !== 'number' ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  )
    return null;
  return {
    imageId: image.imageId,
    src: image.src,
    width: image.width,
    height: image.height,
    ...Object.fromEntries(
      ['imageKey', 'originalSrc', 'watermark', 'watermarkSrc'].flatMap((key) =>
        typeof image[key] === 'string' ? [[key, image[key]]] : [],
      ),
    ),
  };
}

function normalizeDraft(
  value: unknown,
  scope: PublishingDraftScope,
): PublishingDraftValue | null {
  const draft = record(value);
  if (
    !draft ||
    typeof draft.title !== 'string' ||
    typeof draft.content !== 'string' ||
    typeof draft.topics !== 'string' ||
    !Array.isArray(draft.images) ||
    !Array.isArray(draft.media)
  )
    return null;
  const images = draft.images
    .map(normalizeImage)
    .filter((image) => image !== null);
  if (images.length !== draft.images.length) return null;
  const media: PublishingMediaItem[] = [];
  for (const raw of draft.media) {
    const item = record(raw);
    const asset = record(item?.asset);
    if (
      !item ||
      !asset ||
      typeof item.id !== 'string' ||
      typeof asset.uri !== 'string' ||
      !ownsAsset(scope, asset.uri) ||
      typeof asset.width !== 'number' ||
      typeof asset.height !== 'number' ||
      !Number.isFinite(asset.width) ||
      !Number.isFinite(asset.height) ||
      asset.width <= 0 ||
      asset.height <= 0
    )
      return null;
    const uploaded = normalizeImage(item.uploaded);
    if (item.uploaded != null && !uploaded) return null;
    media.push({
      id: item.id,
      asset: {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        mimeType:
          typeof asset.mimeType === 'string' ? asset.mimeType : undefined,
        fileName:
          typeof asset.fileName === 'string' ? asset.fileName : undefined,
      },
      status: uploaded ? 'uploaded' : 'failed',
      uploaded: uploaded ?? undefined,
      inserted: item.inserted === true,
    });
  }
  const document = normalizeDocument(draft.document);
  if (draft.document !== null && !document) return null;
  if (
    draft.pinDraftId !== undefined &&
    (typeof draft.pinDraftId !== 'string' ||
      !/^[1-9]\d*$/.test(draft.pinDraftId))
  )
    return null;
  const pinSourceData = record(draft.pinSourceData);
  if (draft.pinSourceData !== undefined && !pinSourceData) return null;
  return {
    ...(typeof draft.pinDraftId === 'string'
      ? { pinDraftId: draft.pinDraftId }
      : {}),
    ...(pinSourceData ? { pinSourceData } : {}),
    title: draft.title,
    content: draft.content,
    topics: draft.topics,
    images,
    media,
    document,
  };
}

class PublishingDraftRepository {
  private accountGenerations = new Map<string, number>();
  getGeneration(accountKey: string): number {
    return this.accountGenerations.get(accountKey) ?? 0;
  }

  async read(
    scope: PublishingDraftScope,
  ): Promise<PublishingDraftValue | null> {
    if (!scope.accountKey || scope.accountKey === 'guest') return null;
    return localDatabase.run(async (database) => {
      const row = await database.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM publishing_drafts WHERE account_key = ? AND draft_key = ?',
        [scope.accountKey, publishingDraftKey(scope)],
      );
      if (!row) return null;
      try {
        const envelope = record(JSON.parse(row.value_json));
        const value =
          envelope?.version === 1 || envelope?.version === 2
            ? normalizeDraft(envelope.value, scope)
            : null;
        if (!value) throw new Error('草稿内容暂时无法读取');
        return value;
      } catch {
        throw new Error('草稿内容暂时无法读取');
      }
    });
  }

  async save(
    scope: PublishingDraftScope,
    value: PublishingDraftValue,
  ): Promise<void> {
    if (!scope.accountKey || scope.accountKey === 'guest')
      throw new Error('登录资料尚未准备好，暂时无法保存草稿');
    const generation = scope.generation ?? this.getGeneration(scope.accountKey);
    await localDatabase.run(async (database) => {
      if (generation !== (this.accountGenerations.get(scope.accountKey) ?? 0))
        return;
      await database.runAsync(
        `INSERT INTO publishing_drafts (account_key, draft_key, value_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(account_key, draft_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [
          scope.accountKey,
          publishingDraftKey(scope),
          JSON.stringify({ version: 2, value }),
          Date.now(),
        ],
      );
    });
  }

  async retainAsset(
    scope: PublishingDraftScope,
    id: string,
    asset: LocalImageAsset,
  ): Promise<LocalImageAsset> {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('图片标识无效');
    if (!scope.accountKey || scope.accountKey === 'guest')
      throw new Error('登录资料尚未准备好');
    const generation = scope.generation ?? this.getGeneration(scope.accountKey);
    const directory = mediaDirectory(scope);
    const uri = `${directory}${encodeURIComponent(id)}.image`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: asset.uri, to: uri });
    if (generation !== (this.accountGenerations.get(scope.accountKey) ?? 0)) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      throw new Error('账号已移除');
    }
    return { ...asset, uri };
  }

  async releaseAsset(scope: PublishingDraftScope, uri: string): Promise<void> {
    if (ownsAsset(scope, uri))
      await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  async remove(scope: PublishingDraftScope): Promise<void> {
    await localDatabase.run((database) =>
      database.runAsync(
        'DELETE FROM publishing_drafts WHERE account_key = ? AND draft_key = ?',
        [scope.accountKey, publishingDraftKey(scope)],
      ),
    );
    await FileSystem.deleteAsync(mediaDirectory(scope), { idempotent: true });
  }

  async clearAccount(accountKey: string): Promise<void> {
    this.accountGenerations.set(
      accountKey,
      (this.accountGenerations.get(accountKey) ?? 0) + 1,
    );
    await localDatabase.run((database) =>
      database.runAsync('DELETE FROM publishing_drafts WHERE account_key = ?', [
        accountKey,
      ]),
    );
    await FileSystem.deleteAsync(accountDirectory(accountKey), {
      idempotent: true,
    });
  }
}

export const publishingDraftRepository = new PublishingDraftRepository();
