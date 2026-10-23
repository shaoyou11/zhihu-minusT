interface AuthPersistenceOperations {
  write: (value: string) => Promise<void>;
  remove: () => Promise<void>;
  onFailure: () => void;
}

/** Keep Zustand's fire-and-forget writes ordered and expose the final outcome. */
export function createAuthPersistenceQueue({
  write,
  remove,
  onFailure,
}: AuthPersistenceOperations) {
  let pending = Promise.resolve();
  let succeeded = true;

  function enqueue(operation: () => Promise<void>) {
    pending = pending.then(operation).then(
      () => {
        succeeded = true;
      },
      () => {
        succeeded = false;
        onFailure();
      },
    );
    return pending;
  }

  return {
    perform: enqueue,
    write: (value: string) => enqueue(() => write(value)),
    remove: () => enqueue(remove),
    wait: async () => {
      let observed: Promise<void>;
      do {
        observed = pending;
        await observed;
      } while (observed !== pending);
      return succeeded;
    },
  };
}
