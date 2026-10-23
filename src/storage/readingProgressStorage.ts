import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';
import type { ReadingProgressEntry } from '@/utils/readingProgress';

export const READING_PROGRESS_STORE_VERSION = 1;
export const MAX_PROGRESS_ENTRIES = 100;
const MAX_CONTENT_KEY_LENGTH = 256;
const MAX_SNAPSHOT_LENGTH = 128 * 1024;
const LEGACY_STORAGE_KEY = 'progress-storage';
const FILES = [
  'reading-progress.json',
  'reading-progress.backup.json',
] as const;

class UnsupportedProgressVersionError extends Error {
  constructor() {
    super('Unsupported reading progress version');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function normalizeReadingProgress(
  value: unknown,
): Record<string, ReadingProgressEntry> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, entry]) =>
          key.length > 0 &&
          key.length <= MAX_CONTENT_KEY_LENGTH &&
          isRecord(entry) &&
          validNumber(entry.offset) &&
          validNumber(entry.updatedAt),
      )
      .map(([key, value]) => {
        const entry = value as Record<string, unknown> & {
          offset: number;
          updatedAt: number;
        };
        const normalized: ReadingProgressEntry = {
          offset: entry.offset,
          updatedAt: entry.updatedAt,
        };
        if (validNumber(entry.fraction) && entry.fraction <= 1)
          normalized.fraction = entry.fraction;
        if (validNumber(entry.scrollableDistance))
          normalized.scrollableDistance = entry.scrollableDistance;
        return [key, normalized] as const;
      })
      .sort(([keyA, a], [keyB, b]) => {
        const timeDifference = b.updatedAt - a.updatedAt;
        return timeDifference || keyA.localeCompare(keyB);
      })
      .slice(0, MAX_PROGRESS_ENTRIES),
  );
}

function normalizePayload(raw: string): string {
  const data: unknown = JSON.parse(raw);
  if (
    isRecord(data) &&
    typeof data.version === 'number' &&
    data.version > READING_PROGRESS_STORE_VERSION
  )
    throw new UnsupportedProgressVersionError();
  if (!isRecord(data) || !isRecord(data.state))
    throw new Error('Unsupported reading progress payload');
  return JSON.stringify({
    state: { progress: normalizeReadingProgress(data.state.progress) },
    version: READING_PROGRESS_STORE_VERSION,
  });
}

interface Snapshot {
  formatVersion: 1;
  revision: number;
  payload: string;
}

interface ReadingProgressIO {
  read: (filename: string) => Promise<string | null>;
  write: (filename: string, value: string) => Promise<void>;
  readLegacy: () => Promise<string | null>;
  removeLegacy: () => Promise<void>;
  onFailure: () => void;
}

/** Alternate snapshots so an interrupted write retains the preceding one. */
export function createReadingProgressStorage(
  io: ReadingProgressIO,
): StateStorage {
  let chain: Promise<void> = Promise.resolve();
  let loaded = false;
  let latest: { slot: number; snapshot: Snapshot } | null = null;
  const validSlots = new Set<number>();

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const pending = chain.then(operation);
    chain = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  async function load(): Promise<void> {
    if (loaded) return;
    for (const [slot, filename] of FILES.entries()) {
      const raw = await io.read(filename);
      if (raw === null) continue;
      try {
        if (raw.length > MAX_SNAPSHOT_LENGTH)
          throw new Error('Oversized reading progress snapshot');
        const data: unknown = JSON.parse(raw);
        if (
          isRecord(data) &&
          typeof data.formatVersion === 'number' &&
          data.formatVersion > 1
        )
          throw new UnsupportedProgressVersionError();
        if (
          !isRecord(data) ||
          data.formatVersion !== 1 ||
          !Number.isSafeInteger(data.revision) ||
          typeof data.revision !== 'number' ||
          data.revision < 1 ||
          typeof data.payload !== 'string'
        )
          throw new Error('Invalid reading progress snapshot');
        const snapshot: Snapshot = {
          formatVersion: 1,
          revision: data.revision,
          payload: normalizePayload(data.payload),
        };
        validSlots.add(slot);
        if (!latest || latest.snapshot.revision < snapshot.revision)
          latest = { slot, snapshot };
      } catch (error) {
        // An older app must not overwrite a newer persisted format.
        if (error instanceof UnsupportedProgressVersionError) throw error;
        io.onFailure();
      }
    }
    loaded = true;
  }

  async function write(payload: string): Promise<void> {
    await load();
    const slot = latest ? 1 - latest.slot : 0;
    const snapshot: Snapshot = {
      formatVersion: 1,
      revision: (latest?.snapshot.revision ?? 0) + 1,
      payload: normalizePayload(payload),
    };
    const encoded = JSON.stringify(snapshot);
    if (encoded.length > MAX_SNAPSHOT_LENGTH)
      throw new Error('Oversized reading progress snapshot');
    await io.write(FILES[slot], encoded);
    validSlots.add(slot);
    latest = { slot, snapshot };
  }

  return {
    getItem: () =>
      run(async () => {
        await load();
        if (latest) {
          // Retry legacy cleanup left behind by a partial import or keychain
          // deletion failure; a committed file is already authoritative.
          try {
            if (validSlots.size < 2) await write(latest.snapshot.payload);
            await io.removeLegacy();
          } catch {
            io.onFailure();
          }
          return latest.snapshot.payload;
        }
        const legacy = await io.readLegacy();
        if (legacy === null) return null;
        const payload = normalizePayload(legacy);
        try {
          // Commit both copies before removing the old SecureStore payload.
          await write(payload);
          await write(payload);
          await io.removeLegacy();
        } catch {
          io.onFailure();
        }
        return payload;
      }),
    setItem: (_name, value) =>
      run(() => write(value)).catch(() => io.onFailure()),
    // A persisted tombstone prevents old SecureStore values from resurfacing.
    removeItem: () =>
      run(async () => {
        await write(JSON.stringify({ state: { progress: {} }, version: 1 }));
        await io.removeLegacy();
      }).catch(() => io.onFailure()),
  };
}

export const readingProgressStorage = createReadingProgressStorage({
  read: async (filename) => {
    const path = `${FileSystem.documentDirectory}${filename}`;
    if (!(await FileSystem.getInfoAsync(path)).exists) return null;
    return FileSystem.readAsStringAsync(path);
  },
  write: (filename, value) =>
    FileSystem.writeAsStringAsync(
      `${FileSystem.documentDirectory}${filename}`,
      value,
    ),
  readLegacy: () => SecureStore.getItemAsync(LEGACY_STORAGE_KEY),
  removeLegacy: () => SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY),
  onFailure: () => console.warn('读写阅读进度失败'),
});
