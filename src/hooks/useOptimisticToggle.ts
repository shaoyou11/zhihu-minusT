import {
  hashKey,
  type MutateOptions,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import axios, { CanceledError } from 'axios';
import { useCallback, useRef, useState } from 'react';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { showToast } from '@/utils/toast';

export interface UseOptimisticToggleOptions<TData = unknown> {
  queryKey?: QueryKey;
  mutationFn: () => Promise<unknown>;
  onUpdateCache?: (oldData: TData) => TData;
  successMessage?: ((isActive: boolean) => string) | string;
  errorMessage?: string;
  isActive?: boolean;
  onSuccessCallback?: () => void;
  invalidateQueries?: QueryKey[];
}

interface ToggleContext<TData> {
  previous: TData | undefined;
  wasActive: boolean;
  query: object | undefined;
}

interface ToggleSnapshot<TData> extends UseOptimisticToggleOptions<TData> {
  sessionVersion: number;
}

function requireToggleSession(version: number): void {
  if (version !== getAuthSessionVersion())
    throw new CanceledError('登录会话已切换');
}

type ToggleCallOptions<TData> = MutateOptions<
  unknown,
  Error,
  void,
  ToggleContext<TData>
>;

const pendingToggles = new WeakMap<
  QueryClient,
  Map<string | symbol, Promise<unknown>>
>();

export function useOptimisticToggle<TData = unknown>(
  options: UseOptimisticToggleOptions<TData>,
) {
  const queryClient = useQueryClient();
  const localGate = useRef({
    sessionVersion: -1,
    key: Symbol('optimistic-toggle'),
  });
  const localPending = useRef(new Map<string | symbol, Promise<unknown>>());
  const [pendingCount, setPendingCount] = useState(0);

  const mutation = useMutation<
    unknown,
    Error,
    ToggleSnapshot<TData>,
    ToggleContext<TData>
  >({
    mutationFn: (snapshot) => {
      requireToggleSession(snapshot.sessionVersion);
      return snapshot.mutationFn();
    },
    onMutate: async ({
      queryKey,
      onUpdateCache,
      isActive = false,
      sessionVersion,
    }) => {
      requireToggleSession(sessionVersion);
      const wasActive = isActive;
      if (!queryKey || !onUpdateCache) {
        return { previous: undefined, wasActive, query: undefined };
      }

      await queryClient.cancelQueries({ queryKey, exact: true });
      requireToggleSession(sessionVersion);
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      const previous = queryClient.getQueryData<TData>(queryKey);

      if (previous !== undefined) {
        queryClient.setQueryData<TData>(queryKey, onUpdateCache(previous));
      }

      return { previous, wasActive, query };
    },
    onError: (error, { queryKey, errorMessage, sessionVersion }, context) => {
      if (sessionVersion !== getAuthSessionVersion()) return;
      if (
        context?.previous !== undefined &&
        queryKey &&
        queryClient.getQueryCache().find({ queryKey, exact: true }) ===
          context.query
      ) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      if (!axios.isCancel(error))
        showToast(errorMessage ?? '操作失败，请稍后重试');
    },
    onSuccess: (
      _data,
      { successMessage, onSuccessCallback, sessionVersion },
      context,
    ) => {
      if (sessionVersion !== getAuthSessionVersion()) return;
      if (successMessage) {
        const msg =
          typeof successMessage === 'function'
            ? successMessage(context.wasActive)
            : successMessage;
        showToast(msg);
      }
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: async (
      _data,
      _error,
      { queryKey, invalidateQueries, sessionVersion },
      context,
    ) => {
      if (sessionVersion !== getAuthSessionVersion()) return;
      const invalidations: Promise<void>[] = [];
      if (
        queryKey &&
        (!context?.query ||
          queryClient.getQueryCache().find({ queryKey, exact: true }) ===
            context.query)
      ) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey, exact: true }),
        );
      }
      if (invalidateQueries) {
        invalidateQueries.forEach((key) => {
          invalidations.push(queryClient.invalidateQueries({ queryKey: key }));
        });
      }
      await Promise.all(invalidations);
    },
  });

  const mutateAsync = useCallback(
    (_variables?: undefined, callOptions?: ToggleCallOptions<TData>) => {
      // Capture every option at invocation. Observer options can change while
      // onMutate awaits cancellation or while a route changes to another item.
      const snapshot = {
        ...options,
        sessionVersion: getAuthSessionVersion(),
        queryKey: options.queryKey ? [...options.queryKey] : undefined,
        invalidateQueries: options.invalidateQueries?.map((key) => [...key]),
      };
      if (localGate.current.sessionVersion !== snapshot.sessionVersion) {
        localGate.current = {
          sessionVersion: snapshot.sessionVersion,
          key: Symbol('optimistic-toggle'),
        };
      }
      const gateKey = snapshot.queryKey
        ? `${snapshot.sessionVersion}:${hashKey(snapshot.queryKey)}`
        : localGate.current.key;
      let gates = pendingToggles.get(queryClient);
      if (!gates) {
        gates = new Map();
        pendingToggles.set(queryClient, gates);
      }
      const existing = localPending.current.get(gateKey);
      if (existing) return existing;

      const callbacks = {
        onSuccess: (data, _snapshot, context, mutationContext) =>
          snapshot.sessionVersion === getAuthSessionVersion()
            ? callOptions?.onSuccess?.(
                data,
                undefined,
                context,
                mutationContext,
              )
            : undefined,
        onError: (error, _snapshot, context, mutationContext) =>
          snapshot.sessionVersion === getAuthSessionVersion()
            ? callOptions?.onError?.(error, undefined, context, mutationContext)
            : undefined,
        onSettled: (data, error, _snapshot, context, mutationContext) =>
          snapshot.sessionVersion === getAuthSessionVersion()
            ? callOptions?.onSettled?.(
                data,
                error,
                undefined,
                context,
                mutationContext,
              )
            : undefined,
      } satisfies MutateOptions<
        unknown,
        Error,
        ToggleSnapshot<TData>,
        ToggleContext<TData>
      >;
      // Different actions can share a cache key. Queue their entire mutation,
      // including optimistic writes and settled calibration, instead of
      // discarding the later action or overlapping its rollback snapshot.
      const prior = gates.get(gateKey);
      const pending = (
        prior ? prior.catch(() => undefined) : Promise.resolve()
      ).then(() => mutation.mutateAsync(snapshot, callbacks));
      gates.set(gateKey, pending);
      localPending.current.set(gateKey, pending);
      setPendingCount((count) => count + 1);
      const release = () => {
        if (gates.get(gateKey) === pending) gates.delete(gateKey);
        if (localPending.current.get(gateKey) === pending)
          localPending.current.delete(gateKey);
        setPendingCount((count) => count - 1);
      };
      void pending.then(release, release);
      return pending;
    },
    [mutation.mutateAsync, options, queryClient],
  );

  const mutate = useCallback(
    (variables?: undefined, callOptions?: ToggleCallOptions<TData>) => {
      void mutateAsync(variables, callOptions).catch(() => undefined);
    },
    [mutateAsync],
  );

  return {
    ...mutation,
    variables: undefined,
    isPending: mutation.isPending || pendingCount > 0,
    mutate,
    mutateAsync,
  };
}
