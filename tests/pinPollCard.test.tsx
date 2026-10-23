import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { votePinPoll } from '../src/api/zhihu/pin';
import { PinPollCard } from '../src/components/PinPollCard';
import type { ZhihuPinPoll } from '../src/types/zhihu';

jest.mock('../src/api/zhihu/pin', () => ({ votePinPoll: jest.fn() }));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#345678',
  };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/constants/Colors', () => ({
  __esModule: true,
  default: {
    light: {
      border: '#ddd',
      textSecondary: '#666',
      backgroundSecondary: '#fff',
    },
  },
}));

const poll: ZhihuPinPoll = {
  id: 'synthetic-poll',
  max_selections: 2,
  options: [
    { id: 'a', title: '选项 A' },
    { id: 'b', title: '选项 B' },
    { id: 'c', title: '选项 C' },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(value = poll) {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { gcTime: Infinity },
    },
  });
  const host = await render(
    <QueryClientProvider client={client}>
      <PinPollCard poll={value} contentId="synthetic-pin" />
    </QueryClientProvider>,
  );
  return { client, host };
}
beforeEach(() => jest.clearAllMocks());

test('multi-choice selection enforces the maximum without sending a vote until confirmation', async () => {
  jest.mocked(votePinPoll).mockResolvedValue({});
  const { client, host } = await setup();
  const buttons = ['选项 A', '选项 B', '选项 C'].map((name) =>
    host.getByLabelText(name),
  );
  await act(() => {
    for (const button of buttons) button.props.onPress();
  });
  expect(host.getByLabelText('选项 A').props.accessibilityState.checked).toBe(
    true,
  );
  expect(host.getByLabelText('选项 B').props.accessibilityState.checked).toBe(
    true,
  );
  expect(host.getByLabelText('选项 C').props.accessibilityState.checked).toBe(
    false,
  );
  expect(votePinPoll).not.toHaveBeenCalled();
  await fireEvent.press(host.getByLabelText('选项 A'));
  await fireEvent.press(host.getByLabelText('选项 C'));
  await fireEvent.press(host.getByLabelText('提交投票'));
  await waitFor(() =>
    expect(votePinPoll).toHaveBeenCalledWith('synthetic-poll', ['b', 'c']),
  );
  await waitFor(() => expect(host.queryByLabelText('提交投票')).toBeNull());
  await host.unmount();
  client.clear();
});

test('submission has a synchronous lock and remains busy until the detail refresh finishes', async () => {
  const request = deferred<unknown>();
  const refresh = deferred<void>();
  jest.mocked(votePinPoll).mockReturnValue(request.promise);
  const { client, host } = await setup();
  const invalidation = jest
    .spyOn(client, 'invalidateQueries')
    .mockReturnValue(refresh.promise);
  await fireEvent.press(host.getByLabelText('选项 A'));
  const submit = host.getByLabelText('提交投票').props.onPress;
  await act(() => {
    submit();
    submit();
  });
  await waitFor(() => expect(votePinPoll).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(host.getByLabelText('提交投票').props.disabled).toBe(true),
  );
  await act(() => request.resolve({}));
  await waitFor(() =>
    expect(invalidation).toHaveBeenCalledWith({
      queryKey: ['pin-detail', 'synthetic-pin'],
      exact: true,
    }),
  );
  expect(host.getByLabelText('提交投票').props.disabled).toBe(true);
  expect(host.getByLabelText('选项 A').props.disabled).toBe(true);
  await act(() => submit());
  expect(votePinPoll).toHaveBeenCalledTimes(1);
  await act(() => refresh.resolve());
  await waitFor(() => expect(host.queryByLabelText('提交投票')).toBeNull());
  await waitFor(() => expect(host.queryByLabelText('提交投票')).toBeNull());
  await host.unmount();
  client.clear();
});

test('single-choice replaces the selection and a failed submission keeps it available for retry', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest
    .mocked(votePinPoll)
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockResolvedValueOnce({});
  const { client, host } = await setup({ ...poll, max_selections: 1 });
  await fireEvent.press(host.getByLabelText('选项 A'));
  await fireEvent.press(host.getByLabelText('选项 B'));
  expect(host.getByLabelText('选项 A').props.accessibilityState.checked).toBe(
    false,
  );
  await fireEvent.press(host.getByLabelText('提交投票'));
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(host.getByLabelText('提交投票').props.disabled).toBe(false),
  );
  expect(host.getByLabelText('选项 B').props.accessibilityState.checked).toBe(
    true,
  );
  await fireEvent.press(host.getByLabelText('提交投票'));
  await waitFor(() => expect(votePinPoll).toHaveBeenCalledTimes(2));
  expect(jest.mocked(votePinPoll).mock.calls).toEqual([
    ['synthetic-poll', ['b']],
    ['synthetic-poll', ['b']],
  ]);
  await waitFor(() => expect(host.queryByLabelText('提交投票')).toBeNull());
  await host.unmount();
  client.clear();
  alert.mockRestore();
});
