import { act, renderHook } from '@testing-library/react-native';
import { useScopedAsyncValue } from '../src/hooks/useScopedAsyncValue';

test('hides the previous account cache while the new account loads and rejects stale refreshes', async () => {
  const first = { accountKey: 'synthetic-a' };
  const second = { accountKey: 'synthetic-b' };
  let finishSecond: (value: string) => void = () => {};
  const load = jest.fn(async (scope: object) => {
    if (scope === first) return 'cache-a';
    return new Promise<string>((resolve) => {
      finishSecond = resolve;
    });
  });
  const host = await renderHook(
    ({ scope }: { scope: object | null }) => useScopedAsyncValue(scope, load),
    { initialProps: { scope: first as object | null } },
  );
  await act(async () => {});
  expect(host.result.current.value).toBe('cache-a');
  const staleRefresh = host.result.current.setValue;
  await host.rerender({ scope: second });
  expect(host.result.current.ready).toBe(false);
  expect(host.result.current.value).toBeNull();
  await act(() => finishSecond('cache-b'));
  await act(() => staleRefresh('stale-a'));
  expect(host.result.current.value).toBe('cache-b');
  await host.rerender({ scope: null });
  expect(host.result.current.ready).toBe(true);
  expect(host.result.current.value).toBeNull();
});

test('rejects a late initial load after the scope changes', async () => {
  const first = { accountKey: 'synthetic-a' };
  const second = { accountKey: 'synthetic-b' };
  let finishFirst: (value: string) => void = () => {};
  const load = jest.fn(async (scope: object) => {
    if (scope === first)
      return new Promise<string>((resolve) => {
        finishFirst = resolve;
      });
    return 'cache-b';
  });
  const host = await renderHook(
    ({ scope }: { scope: object }) => useScopedAsyncValue(scope, load),
    { initialProps: { scope: first } },
  );
  await host.rerender({ scope: second });
  await act(() => finishFirst('late-a'));
  expect(host.result.current.value).toBe('cache-b');
});
