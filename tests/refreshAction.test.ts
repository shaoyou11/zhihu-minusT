import { act, renderHook } from '@testing-library/react-native';
import { useRefreshAction } from '../src/hooks/useRefreshAction';

test('keeps the refresh indicator active through all work and coalesces duplicate pulls', async () => {
  let finish: () => void = () => {};
  const action = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const host = await renderHook(() => useRefreshAction(action));
  let first: Promise<void> | undefined;
  let second: Promise<void> | undefined;
  await act(() => {
    first = host.result.current.refresh();
    second = host.result.current.refresh();
  });
  expect(first).toBe(second);
  expect(action).toHaveBeenCalledTimes(1);
  expect(host.result.current.refreshing).toBe(true);
  await act(async () => {
    finish();
    await first;
  });
  expect(host.result.current.refreshing).toBe(false);
  await host.unmount();
});

test('a failed refresh releases the indicator and permits a later retry', async () => {
  const action = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockResolvedValueOnce(undefined);
  const host = await renderHook(() => useRefreshAction(action));
  await act(async () => {
    await expect(host.result.current.refresh()).rejects.toThrow(
      'synthetic failure',
    );
  });
  expect(host.result.current.refreshing).toBe(false);
  await act(async () => {
    await host.result.current.refresh();
  });
  expect(action).toHaveBeenCalledTimes(2);
  expect(host.result.current.refreshing).toBe(false);
  await host.unmount();
});
