import { createAuthPersistenceQueue } from '../src/storage/authPersistenceQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('serializes snapshots and waits for writes added during an earlier write', async () => {
  const first = deferred();
  const calls: string[] = [];
  const queue = createAuthPersistenceQueue({
    write: async (value) => {
      calls.push(value);
      if (value === 'old-synthetic-snapshot') await first.promise;
    },
    remove: async () => {
      calls.push('remove');
    },
    onFailure: jest.fn(),
  });
  const oldWrite = queue.write('old-synthetic-snapshot');
  const waiting = queue.wait();
  const newWrite = queue.write('new-synthetic-snapshot');
  const removal = queue.remove();
  await Promise.resolve();
  expect(calls).toEqual(['old-synthetic-snapshot']);
  first.resolve();
  expect(await waiting).toBe(true);
  await Promise.all([oldWrite, newWrite, removal]);
  expect(calls).toEqual([
    'old-synthetic-snapshot',
    'new-synthetic-snapshot',
    'remove',
  ]);
});

test('reports write failure without rejecting an unobserved Zustand write and can retry', async () => {
  const failure = jest.fn();
  const write = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic disk failure'))
    .mockResolvedValue(undefined);
  const queue = createAuthPersistenceQueue({
    write,
    remove: jest.fn(),
    onFailure: failure,
  });
  await expect(queue.write('synthetic-snapshot')).resolves.toBeUndefined();
  expect(await queue.wait()).toBe(false);
  expect(failure).toHaveBeenCalledWith();
  await queue.write('synthetic-snapshot');
  expect(await queue.wait()).toBe(true);
});

test('a failed deletion does not prevent a later successful snapshot', async () => {
  const queue = createAuthPersistenceQueue({
    write: jest.fn().mockResolvedValue(undefined),
    remove: jest
      .fn()
      .mockRejectedValue(new Error('synthetic deletion failure')),
    onFailure: jest.fn(),
  });
  await queue.remove();
  expect(await queue.wait()).toBe(false);
  await queue.write('synthetic-snapshot');
  expect(await queue.wait()).toBe(true);
});
