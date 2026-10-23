import { createNativeSessionSynchronizer } from '../src/utils/nativeSessionSync';

test('a newer session waits for an in-flight write and leaves only its native cookies', async () => {
  let version = 1;
  let cookie: string | null = 'z_c0=synthetic-a; d_c0=synthetic-device';
  const jar = new Map<string, string>();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saveLegacy = jest.fn(async () => {});
  const setCookie = jest.fn(async (name: string, value: string) => {
    await gate;
    jar.set(name, value);
  });
  const sync = createNativeSessionSynchronizer({
    isCurrent: (expectedVersion) => version === expectedVersion,
    getCookies: () => cookie,
    clear: async () => {
      jar.clear();
    },
    setCookie,
    saveLegacy,
  });
  const old = sync(version);
  // Drive the first write into its asynchronous native boundary.
  await Promise.resolve();
  await Promise.resolve();
  expect(setCookie).toHaveBeenCalledTimes(1);
  version = 2;
  cookie = null;
  const current = sync(version);
  release();
  await old;
  await current;
  expect(jar.size).toBe(0);
  expect(setCookie).toHaveBeenCalledTimes(1);
  expect(saveLegacy).toHaveBeenCalledTimes(1);
  expect(saveLegacy).toHaveBeenLastCalledWith(null);
});

test('a rejected native operation does not block the next session or replay old work', async () => {
  let version = 1;
  const clear = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockResolvedValue(undefined);
  const sync = createNativeSessionSynchronizer({
    isCurrent: (expected) => version === expected,
    getCookies: () => null,
    clear,
    setCookie: jest.fn(),
    saveLegacy: jest.fn(async () => {}),
  });
  await expect(sync(1)).rejects.toThrow('synthetic failure');
  version = 2;
  await sync(2);
  expect(clear).toHaveBeenCalledTimes(2);
  await sync(1);
  expect(clear).toHaveBeenCalledTimes(2);
});

test('a queued account sync reads rotated cookies before clearing the previous native account', async () => {
  let cookie = 'z_c0=synthetic-selected';
  const jar = new Map([['z_c0', 'synthetic-previous-account']]);
  const saveLegacy = jest.fn(async () => {});
  const sync = createNativeSessionSynchronizer({
    isCurrent: (version) => version === 1,
    getCookies: () => cookie,
    clear: async () => {
      jar.clear();
    },
    setCookie: async (name, value) => {
      jar.set(name, value);
    },
    saveLegacy,
  });
  const pending = sync(1);
  cookie = 'z_c0=synthetic-rotated';
  await pending;
  expect([...jar]).toEqual([['z_c0', 'synthetic-rotated']]);
  expect(saveLegacy).toHaveBeenLastCalledWith(cookie);
});

test('same-account rotation during a native write restarts with the complete latest snapshot', async () => {
  let cookie = 'z_c0=synthetic-old; d_c0=synthetic-old-device';
  const jar = new Map<string, string>();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saveLegacy = jest.fn(async () => {});
  const setCookie = jest.fn(async (name: string, value: string) => {
    await gate;
    jar.set(name, value);
  });
  const sync = createNativeSessionSynchronizer({
    isCurrent: (version) => version === 1,
    getCookies: () => cookie,
    clear: async () => {
      jar.clear();
    },
    setCookie,
    saveLegacy,
  });
  const pending = sync(1);
  await Promise.resolve();
  await Promise.resolve();
  expect(setCookie).toHaveBeenCalledTimes(1);
  cookie = 'z_c0=synthetic-rotated; d_c0=synthetic-new-device';
  release();
  await pending;
  expect([...jar]).toEqual([
    ['z_c0', 'synthetic-rotated'],
    ['d_c0', 'synthetic-new-device'],
  ]);
  expect(saveLegacy).toHaveBeenCalledTimes(1);
  expect(saveLegacy).toHaveBeenLastCalledWith(cookie);
});
