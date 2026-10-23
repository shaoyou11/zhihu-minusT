import {
  createReadingProgressStorage,
  MAX_PROGRESS_ENTRIES,
  normalizeReadingProgress,
} from '../src/storage/readingProgressStorage';

function payload(offset: number, version = 1): string {
  return JSON.stringify({
    state: { progress: { 'answer:test': { offset, updatedAt: offset } } },
    version,
  });
}

function createIO(legacy: string | null = null) {
  const files = new Map<string, string>();
  let oldPayload = legacy;
  const operations: string[] = [];
  const io = {
    read: jest.fn(async (name: string) => files.get(name) ?? null),
    write: jest.fn(async (name: string, value: string) => {
      operations.push(`write:${name}`);
      files.set(name, value);
    }),
    readLegacy: jest.fn(async () => oldPayload),
    removeLegacy: jest.fn(async () => {
      operations.push('removeLegacy');
      oldPayload = null;
    }),
    onFailure: jest.fn(),
  };
  return { io, files, operations, storage: createReadingProgressStorage(io) };
}

test('imports legacy SecureStore data to both snapshots before deleting its old copy', async () => {
  const state = createIO(payload(600, 0));
  expect(await state.storage.getItem('progress-storage')).toBe(payload(600));
  expect(state.operations).toEqual([
    'write:reading-progress.json',
    'write:reading-progress.backup.json',
    'removeLegacy',
  ]);
  state.io.readLegacy.mockClear();
  const restarted = createReadingProgressStorage(state.io);
  expect(await restarted.getItem('progress-storage')).toBe(payload(600));
  expect(state.io.readLegacy).not.toHaveBeenCalled();
});

test('retains usable legacy data when migration writes fail and retries after restart', async () => {
  const state = createIO(payload(600, 0));
  state.io.write.mockRejectedValueOnce(new Error('synthetic IO failure'));
  expect(await state.storage.getItem('progress-storage')).toBe(payload(600));
  expect(state.io.removeLegacy).not.toHaveBeenCalled();
  expect(state.io.onFailure).toHaveBeenCalledTimes(1);
  expect(
    await createReadingProgressStorage(state.io).getItem('progress-storage'),
  ).toBe(payload(600));
  expect(state.io.removeLegacy).toHaveBeenCalledTimes(1);
});

test('recovers the preceding snapshot after an interrupted newer write', async () => {
  const state = createIO();
  await state.storage.setItem('progress-storage', payload(100));
  state.io.write.mockImplementationOnce(async (name) => {
    state.files.set(name, '{partial');
    throw new Error('synthetic IO failure');
  });
  await state.storage.setItem('progress-storage', payload(200));
  const restarted = createReadingProgressStorage(state.io);
  expect(await restarted.getItem('progress-storage')).toBe(payload(100));
  await restarted.setItem('progress-storage', payload(300));
  expect(
    await createReadingProgressStorage(state.io).getItem('progress-storage'),
  ).toBe(payload(300));
});

test('serializes concurrent saves so a slower earlier write cannot overwrite the latest position', async () => {
  const state = createIO();
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  state.io.write.mockImplementationOnce(async (name, value) => {
    started?.();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    state.files.set(name, value);
  });
  const first = state.storage.setItem('progress-storage', payload(100));
  await began;
  const second = state.storage.setItem('progress-storage', payload(200));
  expect(state.io.write).toHaveBeenCalledTimes(1);
  finish?.();
  await Promise.all([first, second]);
  expect(
    await createReadingProgressStorage(state.io).getItem('progress-storage'),
  ).toBe(payload(200));
});

test('keeps only the newest valid bounded entries when importing old data', () => {
  const progress = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [
      `answer:${index}`,
      { offset: index, updatedAt: index, extra: 'synthetic-private-detail' },
    ]),
  );
  progress.invalid = { offset: -1, updatedAt: 200, extra: '' };
  const normalized = normalizeReadingProgress(progress);
  expect(Object.keys(normalized)).toHaveLength(MAX_PROGRESS_ENTRIES);
  expect(normalized['answer:0']).toBeUndefined();
  expect(normalized['answer:119']).toEqual({ offset: 119, updatedAt: 119 });
  expect(normalized.invalid).toBeUndefined();
  expect(JSON.stringify(normalized)).not.toContain('synthetic-private-detail');
});

test('a persistence clear writes a tombstone so legacy data cannot resurface', async () => {
  const state = createIO(payload(600, 0));
  await state.storage.removeItem('progress-storage');
  state.io.readLegacy.mockClear();
  const raw = await createReadingProgressStorage(state.io).getItem(
    'progress-storage',
  );
  expect(raw && JSON.parse(raw)).toEqual({
    state: { progress: {} },
    version: 1,
  });
  expect(state.io.readLegacy).not.toHaveBeenCalled();
});

test('finishes legacy cleanup after a partial import was interrupted', async () => {
  const state = createIO(payload(600, 0));
  state.io.write
    .mockImplementationOnce(async (name, value) => {
      state.files.set(name, value);
    })
    .mockRejectedValueOnce(new Error('synthetic IO failure'));
  await state.storage.getItem('progress-storage');
  expect(state.io.removeLegacy).not.toHaveBeenCalled();
  expect(
    await createReadingProgressStorage(state.io).getItem('progress-storage'),
  ).toBe(payload(600));
  expect(state.io.removeLegacy).toHaveBeenCalledTimes(1);
});

test('refuses to overwrite a future persisted version after an app downgrade', async () => {
  const state = createIO();
  const future = JSON.stringify({
    formatVersion: 2,
    revision: 1,
    payload: payload(600),
  });
  state.files.set('reading-progress.json', future);
  await expect(state.storage.getItem('progress-storage')).rejects.toThrow(
    'Unsupported reading progress version',
  );
  await state.storage.setItem('progress-storage', payload(100));
  expect(state.io.write).not.toHaveBeenCalled();
  expect(state.files.get('reading-progress.json')).toBe(future);
});
