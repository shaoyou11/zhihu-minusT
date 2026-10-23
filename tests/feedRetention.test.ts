import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  FEED_CACHE_TTL_MS,
  FeedCacheRepository,
  MAX_FEED_CACHE_BYTES_PER_CONTEXT,
  MAX_FEED_CACHE_CONTEXTS,
} from '../src/storage/feedCacheRepository';
import {
  FEED_EXPOSURE_MAINTENANCE_INTERVAL_MS,
  FEED_EXPOSURE_RETENTION_MS,
  FeedExposureRepository,
  MAX_FEED_EXPOSURES,
  MAX_FEED_EXPOSURES_PER_CONTEXT,
} from '../src/storage/feedExposureRepository';
import { localDatabase } from '../src/storage/localDatabase';

jest.mock('../src/storage/localDatabase', () => ({
  localDatabase: { run: jest.fn() },
}));

let database: DatabaseSync;
let now: number;
const context = { accountKey: 'synthetic-account', feedType: 'recommend' };
const runAsync = jest.fn(
  async (sql: string, parameters: SQLInputValue[] = []) =>
    database.prepare(sql).run(...parameters),
);

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  // The published v1/v2 schemas are unchanged by the retention policy.
  database.exec(`
    CREATE TABLE feed_cache (
      account_key TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      items_json TEXT NOT NULL,
      next_url TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_key, feed_type)
    );
    CREATE TABLE recent_feed_exposures (
      account_key TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      last_exposed_at INTEGER NOT NULL,
      PRIMARY KEY (account_key, feed_type, content_type, content_id)
    );
  `);
  now = 100 * 24 * 60 * 60 * 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  runAsync.mockClear();
  runAsync.mockImplementation(async (sql, parameters = []) =>
    database.prepare(sql).run(...parameters),
  );
  const adapter = {
    runAsync,
    getFirstAsync: async (sql: string, parameters: SQLInputValue[] = []) =>
      database.prepare(sql).get(...parameters) ?? null,
    getAllAsync: async (sql: string, parameters: SQLInputValue[] = []) =>
      database.prepare(sql).all(...parameters),
    withTransactionAsync: async (operation: () => Promise<void>) => {
      database.exec('BEGIN');
      try {
        await operation();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  // Test stand-in implements only the Expo methods these repositories use.
  jest
    .mocked(localDatabase.run)
    .mockImplementation((operation) =>
      operation(adapter as unknown as SQLiteDatabase),
    );
});

afterEach(() => {
  database.close();
  jest.restoreAllMocks();
});

function count(table: string): number {
  return Number(
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count,
  );
}

test('returns fresh cached Feed data and removes it exactly at the TTL boundary', async () => {
  const repository = new FeedCacheRepository();
  await repository.saveFeedCache(
    context,
    [{ id: 'synthetic-content' }],
    'next',
  );
  now += FEED_CACHE_TTL_MS - 1;
  expect(await repository.getFeedCache(context)).toEqual({
    items: [{ id: 'synthetic-content' }],
    nextUrl: 'next',
  });
  now += 1;
  expect(await repository.getFeedCache(context)).toBeNull();
  expect(count('feed_cache')).toBe(0);
});

test('feedback removes only its cached content without extending cache lifetime', async () => {
  const repository = new FeedCacheRepository();
  const items = [
    { id: 'same-token', type: 'answers' },
    { id: 'same-token', type: 'articles' },
  ];
  const otherContext = { ...context, accountKey: 'another-account' };
  await repository.saveFeedCache(context, items, 'next-page');
  await repository.saveFeedCache(otherContext, items, 'next-page');
  now += 1;
  await repository.removeFeedCacheItem(context, 'answer:same-token');
  expect(await repository.getFeedCache(context)).toEqual({
    items: [items[1]],
    nextUrl: 'next-page',
  });
  expect(await repository.getFeedCache(otherContext)).toEqual({
    items,
    nextUrl: 'next-page',
  });
  now += FEED_CACHE_TTL_MS - 1;
  expect(await repository.getFeedCache(context)).toBeNull();
});

test('retains only the newest cache contexts during one long session', async () => {
  const repository = new FeedCacheRepository();
  for (let index = 0; index <= MAX_FEED_CACHE_CONTEXTS; index += 1) {
    now += 1;
    await repository.saveFeedCache(
      { ...context, accountKey: `synthetic-${index}` },
      [{ id: 'synthetic-content' }],
    );
  }
  expect(count('feed_cache')).toBe(MAX_FEED_CACHE_CONTEXTS);
  expect(
    await repository.getFeedCache({ ...context, accountKey: 'synthetic-0' }),
  ).toBeNull();
  expect(
    await repository.getFeedCache({
      ...context,
      accountKey: `synthetic-${MAX_FEED_CACHE_CONTEXTS}`,
    }),
  ).not.toBeNull();
});

test('counts multibyte payload bytes and does not retain an oversized replacement', async () => {
  const repository = new FeedCacheRepository();
  await repository.saveFeedCache(context, [{ id: 'old' }]);
  await repository.saveFeedCache(context, [
    {
      content: '文'.repeat(Math.ceil(MAX_FEED_CACHE_BYTES_PER_CONTEXT / 3)),
    },
  ]);
  expect(count('feed_cache')).toBe(0);
});

test('discarding a corrupt cache never logs its stored payload', async () => {
  database
    .prepare('INSERT INTO feed_cache VALUES (?, ?, ?, ?, ?)')
    .run(
      context.accountKey,
      context.feedType,
      '{synthetic-private-value',
      null,
      now,
    );
  const warning = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  expect(await new FeedCacheRepository().getFeedCache(context)).toBeNull();
  expect(count('feed_cache')).toBe(0);
  expect(warning).toHaveBeenCalledWith('解析本地 Feed 缓存失败');
});

test('enforces the global exposure limit after writes without waiting for a new launch', async () => {
  const repository = new FeedExposureRepository();
  await repository.getRecentContentKeys(context);
  const insert = database.prepare(
    'INSERT INTO recent_feed_exposures VALUES (?, ?, ?, ?, ?)',
  );
  database.exec('BEGIN');
  for (let index = 0; index < MAX_FEED_EXPOSURES; index += 1) {
    insert.run(
      `synthetic-${Math.floor(index / MAX_FEED_EXPOSURES_PER_CONTEXT)}`,
      'recommend',
      'answer',
      String(index),
      now - 1000,
    );
  }
  database.exec('COMMIT');
  await repository.recordExposures(context, [
    { contentType: 'answer', contentId: 'newest' },
  ]);
  expect(count('recent_feed_exposures')).toBe(MAX_FEED_EXPOSURES);
  expect(await repository.getRecentContentKeys(context)).toEqual(
    new Set(['answer:newest']),
  );
});

test('enforces the per-context exposure limit independently of the global limit', async () => {
  const repository = new FeedExposureRepository();
  await repository.recordExposures(
    context,
    Array.from({ length: MAX_FEED_EXPOSURES_PER_CONTEXT + 1 }, (_, index) => ({
      contentType: 'answer',
      contentId: String(index),
    })),
  );
  expect(count('recent_feed_exposures')).toBe(MAX_FEED_EXPOSURES_PER_CONTEXT);
});

test('runs retention maintenance again during a long session but skips unnecessary passes', async () => {
  const repository = new FeedExposureRepository();
  await repository.recordExposures(context, [
    { contentType: 'answer', contentId: 'old' },
  ]);
  const retentionPasses = () =>
    runAsync.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM recent_feed_exposures WHERE last_exposed_at <'),
    ).length;
  expect(retentionPasses()).toBe(1);
  now += FEED_EXPOSURE_MAINTENANCE_INTERVAL_MS - 1;
  await repository.getRecentContentKeys(context);
  expect(retentionPasses()).toBe(1);
  now += FEED_EXPOSURE_RETENTION_MS;
  expect(await repository.getRecentContentKeys(context)).toEqual(new Set());
  expect(retentionPasses()).toBe(2);
  expect(count('recent_feed_exposures')).toBe(0);
});

test('retries failed exposure maintenance and rolls back its transaction', async () => {
  const repository = new FeedExposureRepository();
  runAsync.mockRejectedValueOnce(new Error('synthetic IO failure'));
  await expect(repository.getRecentContentKeys(context)).rejects.toThrow(
    'synthetic IO failure',
  );
  await expect(repository.getRecentContentKeys(context)).resolves.toEqual(
    new Set(),
  );
  expect(
    runAsync.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM recent_feed_exposures WHERE last_exposed_at <'),
    ),
  ).toHaveLength(2);
});
