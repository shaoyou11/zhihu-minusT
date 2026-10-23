import type { SQLiteDatabase } from 'expo-sqlite';
import { getFeedContentKey } from '@/utils/feedIdentity';
import { localDatabase } from './localDatabase';

export const MAX_CACHED_LAUNCH_FEED_ITEMS = 10;
export const FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_FEED_CACHE_CONTEXTS = 20;
export const MAX_FEED_CACHE_BYTES_PER_CONTEXT = 256 * 1024;
const MAX_NEXT_URL_LENGTH = 4096;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export interface FeedCacheContext {
  accountKey: string;
  feedType: string;
}

export interface CachedFeedResult<T = unknown> {
  items: T[];
  nextUrl: string | null;
}

interface FeedCacheRow {
  items_json: string;
  next_url: string | null;
  updated_at: number;
}

export class FeedCacheRepository {
  async getFeedCache<T = unknown>(
    context: FeedCacheContext,
  ): Promise<CachedFeedResult<T> | null> {
    if (!context.accountKey.trim() || !context.feedType.trim()) return null;

    return localDatabase.run(async (database) => {
      await this.maintain(database, Date.now());
      const row = await database.getFirstAsync<FeedCacheRow>(
        `SELECT items_json, next_url, updated_at
         FROM feed_cache
         WHERE account_key = ? AND feed_type = ?`,
        [context.accountKey, context.feedType],
      );

      if (!row) return null;

      try {
        const items: unknown = JSON.parse(row.items_json);
        if (!Array.isArray(items) || items.length === 0)
          throw new Error('Invalid Feed cache');
        return {
          items: items.slice(0, MAX_CACHED_LAUNCH_FEED_ITEMS),
          nextUrl: row.next_url ?? null,
        };
      } catch {
        await database.runAsync(
          'DELETE FROM feed_cache WHERE account_key = ? AND feed_type = ?',
          [context.accountKey, context.feedType],
        );
        console.warn('解析本地 Feed 缓存失败');
        return null;
      }
    });
  }

  async saveFeedCache(
    context: FeedCacheContext,
    items: unknown[],
    nextUrl?: string | null,
  ): Promise<void> {
    if (!context.accountKey.trim() || !context.feedType.trim()) return;
    const boundedItems = items.slice(0, MAX_CACHED_LAUNCH_FEED_ITEMS);
    const itemsJson = JSON.stringify(boundedItems);
    const now = Date.now();

    await localDatabase.run(async (database) => {
      await database.withTransactionAsync(async () => {
        await this.maintain(database, now);
        if (
          boundedItems.length === 0 ||
          utf8ByteLength(itemsJson) > MAX_FEED_CACHE_BYTES_PER_CONTEXT
        ) {
          await database.runAsync(
            'DELETE FROM feed_cache WHERE account_key = ? AND feed_type = ?',
            [context.accountKey, context.feedType],
          );
          return;
        }
        await database.runAsync(
          `INSERT INTO feed_cache (
           account_key,
           feed_type,
           items_json,
           next_url,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_key, feed_type) DO UPDATE SET
           items_json = excluded.items_json,
           next_url = excluded.next_url,
           updated_at = excluded.updated_at`,
          [
            context.accountKey,
            context.feedType,
            itemsJson,
            nextUrl && nextUrl.length <= MAX_NEXT_URL_LENGTH ? nextUrl : null,
            now,
          ],
        );
        await this.trim(database);
      });
    });
  }

  private async maintain(database: SQLiteDatabase, now: number): Promise<void> {
    await database.runAsync(
      `DELETE FROM feed_cache
       WHERE updated_at <= ? OR length(CAST(items_json AS BLOB)) > ?
          OR length(next_url) > ?`,
      [
        now - FEED_CACHE_TTL_MS,
        MAX_FEED_CACHE_BYTES_PER_CONTEXT,
        MAX_NEXT_URL_LENGTH,
      ],
    );
    await this.trim(database);
  }

  async removeFeedCacheItem(
    context: FeedCacheContext,
    contentKey: string,
  ): Promise<void> {
    if (!context.accountKey.trim() || !context.feedType.trim()) return;
    await localDatabase.run(async (database) => {
      await database.withTransactionAsync(async () => {
        const row = await database.getFirstAsync<FeedCacheRow>(
          'SELECT items_json, next_url, updated_at FROM feed_cache WHERE account_key = ? AND feed_type = ?',
          [context.accountKey, context.feedType],
        );
        if (!row) return;
        let remaining: unknown[] = [];
        try {
          const items: unknown = JSON.parse(row.items_json);
          if (Array.isArray(items)) {
            remaining = items.filter((item: unknown) => {
              if (typeof item !== 'object' || item === null) return true;
              const id = 'id' in item ? item.id : undefined;
              const type = 'type' in item ? item.type : undefined;
              if (
                (typeof id !== 'string' && typeof id !== 'number') ||
                typeof type !== 'string'
              )
                return true;
              return getFeedContentKey({ id, type }) !== contentKey;
            });
          }
        } catch {}
        if (remaining.length === 0) {
          await database.runAsync(
            'DELETE FROM feed_cache WHERE account_key = ? AND feed_type = ?',
            [context.accountKey, context.feedType],
          );
          return;
        }
        await database.runAsync(
          'UPDATE feed_cache SET items_json = ? WHERE account_key = ? AND feed_type = ?',
          [JSON.stringify(remaining), context.accountKey, context.feedType],
        );
      });
    });
  }

  private async trim(database: SQLiteDatabase): Promise<void> {
    await database.runAsync(
      `DELETE FROM feed_cache WHERE rowid IN (
         SELECT rowid FROM feed_cache
         ORDER BY updated_at DESC, account_key DESC, feed_type DESC
         LIMIT -1 OFFSET ?
       )`,
      [MAX_FEED_CACHE_CONTEXTS],
    );
  }

  async clearAccountCache(accountKey: string): Promise<void> {
    if (!accountKey.trim()) return;
    await localDatabase.run(async (database) => {
      await database.runAsync('DELETE FROM feed_cache WHERE account_key = ?', [
        accountKey,
      ]);
    });
  }
}

export const feedCacheRepository = new FeedCacheRepository();
