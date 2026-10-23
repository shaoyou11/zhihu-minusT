interface NativeSessionOperations {
  isCurrent: (version: number) => boolean;
  getCookies: () => string | null;
  clear: () => Promise<unknown>;
  setCookie: (name: string, value: string) => Promise<unknown>;
  saveLegacy: (cookies: string | null) => Promise<unknown>;
}

/** Serialized native writes cannot finish after a newer queued session. */
export function createNativeSessionSynchronizer(
  operations: NativeSessionOperations,
) {
  let pending: Promise<void> = Promise.resolve();
  return (version: number): Promise<void> => {
    const run = pending.then(async () => {
      while (operations.isCurrent(version)) {
        // A response may rotate cookies without changing the selected account.
        // Read at execution time and restart if a native write crosses a rotation.
        const cookies = operations.getCookies();
        await operations.clear();
        if (!operations.isCurrent(version)) return;
        if (cookies !== operations.getCookies()) continue;
        for (const pair of cookies?.split(';') ?? []) {
          const separator = pair.indexOf('=');
          if (separator <= 0) continue;
          const name = pair.slice(0, separator).trim();
          const value = pair.slice(separator + 1).trim();
          if (!name || !value) continue;
          await operations.setCookie(name, value);
          if (!operations.isCurrent(version)) return;
          if (cookies !== operations.getCookies()) break;
        }
        if (cookies !== operations.getCookies()) continue;
        await operations.saveLegacy(cookies);
        if (cookies === operations.getCookies()) return;
      }
    });
    pending = run.catch(() => undefined);
    return run;
  };
}
