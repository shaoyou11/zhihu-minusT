const FORMAT = 'zhihu-auth-aes-gcm';

export interface AuthStorageOperations {
  read: (slot: 'primary' | 'backup') => Promise<string | null>;
  writeAtomically: (slot: 'primary' | 'backup', value: string) => Promise<void>;
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
  onPresence: (present: boolean) => void;
  onFailure: (failed: boolean) => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the persistence envelope before allowing recovery or replacement. */
export function isSerializedAuthState(serialized: string): boolean {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || !record(value.state)) return false;
    if (
      value.version !== undefined &&
      (!Number.isInteger(value.version) ||
        Number(value.version) < 0 ||
        Number(value.version) > 2)
    )
      return false;
    const state = value.state;
    if (
      state.cookies !== undefined &&
      state.cookies !== null &&
      typeof state.cookies !== 'string'
    )
      return false;
    if (state.me !== undefined && state.me !== null && !record(state.me))
      return false;
    if (
      state.activeAccountIndex !== undefined &&
      (!Number.isInteger(state.activeAccountIndex) ||
        Number(state.activeAccountIndex) < -1)
    )
      return false;
    if (
      state.accounts !== undefined &&
      (!Array.isArray(state.accounts) ||
        state.accounts.some(
          (account: unknown) =>
            !record(account) ||
            typeof account.cookies !== 'string' ||
            !record(account.me),
        ))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export function createEncryptedAuthStorage(operations: AuthStorageOperations) {
  let initialized = false;
  let readBlocked = false;
  let snapshotRead = false;
  let loading: Promise<string | null> | null = null;
  let pending: Promise<unknown> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  async function seal(value: string): Promise<string> {
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      data: await operations.encrypt(value),
    });
  }

  async function open(
    value: string,
  ): Promise<{ serialized: string; legacy: boolean }> {
    const envelope: unknown = JSON.parse(value);
    const legacy = !(record(envelope) && envelope.format === FORMAT);
    let serialized = value;
    if (!legacy) {
      if (
        !record(envelope) ||
        envelope.version !== 1 ||
        typeof envelope.data !== 'string' ||
        !envelope.data
      )
        throw new Error('登录文件格式无效');
      serialized = await operations.decrypt(envelope.data);
    }
    if (!isSerializedAuthState(serialized)) throw new Error('登录文件格式无效');
    return { serialized, legacy };
  }

  async function load(): Promise<string | null> {
    let found = false;
    let failure = false;
    for (const slot of ['primary', 'backup'] as const) {
      let contents: string | null;
      try {
        contents = await operations.read(slot);
        if (contents === null) continue;
        found = true;
      } catch {
        failure = true;
        continue;
      }
      try {
        const { serialized, legacy } = await open(contents);
        operations.onPresence(true);
        initialized = true;
        snapshotRead = true;
        readBlocked = false;
        try {
          const encrypted = legacy ? await seal(serialized) : contents;
          // Both copies represent the CURRENT session after a successful write.
          // Keeping an older authenticated backup could resurrect a logout.
          await operations.writeAtomically('backup', encrypted);
          if (legacy || slot === 'backup')
            await operations.writeAtomically('primary', encrypted);
          operations.onFailure(false);
        } catch {
          readBlocked = true;
          operations.onFailure(true);
        }
        return serialized;
      } catch {
        failure = true;
      }
    }
    operations.onPresence(found || failure);
    initialized = true;
    readBlocked = found || failure;
    snapshotRead = !readBlocked;
    operations.onFailure(readBlocked);
    if (readBlocked) throw new Error('无法读取已保存账号，请重试恢复');
    return null;
  }

  async function getItem(): Promise<string | null> {
    if (loading) return loading;
    loading = exclusive(load);
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  async function setItem(serialized: string): Promise<void> {
    if (!initialized) await load();
    if (readBlocked) throw new Error('已保存账号暂时不可读取，未覆盖原文件');
    if (!isSerializedAuthState(serialized)) throw new Error('登录状态格式无效');
    try {
      const encrypted = await seal(serialized);
      // Backup first: interruption before primary commit preserves the old
      // primary; success leaves two copies of the same current snapshot.
      await operations.writeAtomically('backup', encrypted);
      await operations.writeAtomically('primary', encrypted);
      const stored = await operations.read('primary');
      if (!stored || (await open(stored)).serialized !== serialized)
        throw new Error('登录保存校验失败');
      operations.onPresence(true);
      operations.onFailure(false);
    } catch {
      operations.onFailure(true);
      throw new Error('保存登录状态失败');
    }
  }

  return {
    getItem,
    setItem: (value: string) => exclusive(() => setItem(value)),
    ensureWritable: () =>
      exclusive(async () => {
        if (readBlocked && !snapshotRead) throw new Error('请先恢复已保存账号');
        if (!initialized || readBlocked) await load();
        if (readBlocked) throw new Error('已保存账号暂时不可读取');
      }),
    hasReadableSnapshot: () => snapshotRead,
    // A durable empty snapshot prevents an old backup/native cookie import
    // from reviving a deliberately cleared session.
    removeItem: () =>
      exclusive(() =>
        setItem(
          JSON.stringify({
            state: {
              accounts: [],
              activeAccountIndex: -1,
              cookies: null,
              me: null,
            },
            version: 2,
          }),
        ),
      ),
    reset: (beforeClear?: () => Promise<void>) =>
      exclusive(async () => {
        await beforeClear?.();
        initialized = true;
        readBlocked = false;
        snapshotRead = true;
        await setItem(
          JSON.stringify({
            state: {
              accounts: [],
              activeAccountIndex: -1,
              cookies: null,
              me: null,
            },
            version: 2,
          }),
        );
      }),
  };
}
