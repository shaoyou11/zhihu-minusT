import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'local-data.db';
const DATABASE_VERSION = 4;

interface UserVersionRow {
  user_version: number;
}

interface DatabaseMigration {
  version: number;
  sql: string;
}

const MIGRATIONS: DatabaseMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE recent_feed_exposures (
        account_key TEXT NOT NULL CHECK (length(account_key) > 0),
        feed_type TEXT NOT NULL CHECK (length(feed_type) > 0),
        content_type TEXT NOT NULL CHECK (length(content_type) > 0),
        content_id TEXT NOT NULL CHECK (length(content_id) > 0),
        last_exposed_at INTEGER NOT NULL,
        PRIMARY KEY (account_key, feed_type, content_type, content_id)
      );
      CREATE INDEX recent_feed_exposures_context_time_idx
        ON recent_feed_exposures (
          account_key,
          feed_type,
          last_exposed_at DESC
        );
      -- Not used by dedup queries today. Kept for future cross-feed lookups
      -- of the form "has this account seen content X in any feed", which
      -- local recommendation filtering is expected to need.
      CREATE INDEX recent_feed_exposures_account_content_idx
        ON recent_feed_exposures (
          account_key,
          content_type,
          content_id,
          last_exposed_at DESC
        );
      CREATE INDEX recent_feed_exposures_time_idx
        ON recent_feed_exposures (last_exposed_at DESC);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE feed_cache (
        account_key TEXT NOT NULL CHECK (length(account_key) > 0),
        feed_type TEXT NOT NULL CHECK (length(feed_type) > 0),
        items_json TEXT NOT NULL,
        next_url TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_key, feed_type)
      );
    `,
  },
  {
    version: 3,
    sql: `
      -- The launch cache only ever reads back the recommendation feed, but
      -- earlier builds wrote a row for every feed tab. Those rows are dead
      -- weight; drop them once.
      DELETE FROM feed_cache WHERE feed_type <> 'recommend';
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE publishing_drafts (
        account_key TEXT NOT NULL CHECK (length(account_key) > 0),
        draft_key TEXT NOT NULL CHECK (length(draft_key) > 0),
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_key, draft_key)
      );
    `,
  },
];

/**
 * Shared SQLite entry point for bounded local application data.
 *
 * Future features such as local recommendations should add their own tables
 * through a new migration instead of overloading the exposure table.
 */
class LocalDatabase {
  private databasePromise: Promise<SQLiteDatabase> | null = null;
  private operationChain: Promise<void> = Promise.resolve();

  run<T>(operation: (database: SQLiteDatabase) => Promise<T>): Promise<T> {
    const result = this.operationChain.then(async () => {
      const database = await this.open();
      return operation(database);
    });
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async open(): Promise<SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openAndMigrate().catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  private async openAndMigrate(): Promise<SQLiteDatabase> {
    const database = await openDatabaseAsync(DATABASE_NAME);

    try {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
      `);

      const versionRow = await database.getFirstAsync<UserVersionRow>(
        'PRAGMA user_version',
      );
      const currentVersion = versionRow?.user_version ?? 0;
      if (currentVersion > DATABASE_VERSION) {
        throw new Error(
          `Local database version ${currentVersion} is newer than supported version ${DATABASE_VERSION}`,
        );
      }

      for (const migration of MIGRATIONS) {
        if (migration.version <= currentVersion) continue;
        await database.withTransactionAsync(async () => {
          await database.execAsync(migration.sql);
          await database.execAsync(
            `PRAGMA user_version = ${migration.version}`,
          );
        });
      }

      return database;
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  }
}

export const localDatabase = new LocalDatabase();
