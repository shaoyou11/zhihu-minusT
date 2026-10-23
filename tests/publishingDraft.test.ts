import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createPublishingDocument } from '../src/features/publishing/document';
import {
  emptyPublishingDraft,
  type PublishingDraftValue,
} from '../src/features/publishing/types';
import { usePublishingDraft } from '../src/features/publishing/usePublishingDraft';
import { publishingDraftRepository } from '../src/storage/publishingDraftRepository';
import { showToast } from '../src/utils/toast';

let mockAccount = { me: { id: 'A', url_token: 'a' }, cookies: 'synthetic' };
let mockVersion = 0;
let mockPrevent: {
  enabled: boolean;
  callback: (event: { repeat: () => void }) => void;
};
const mockRepeat = jest.fn();
const mockDisablePrevention = jest.fn();
jest.mock('expo-router', () => ({
  usePreventRemove: (
    enabled: boolean,
    callback: typeof mockPrevent.callback,
  ) => {
    mockPrevent = { enabled, callback };
    return mockDisablePrevention;
  },
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockVersion,
  useAuthStore: (selector: (value: typeof mockAccount) => unknown) =>
    selector(mockAccount),
}));
jest.mock('../src/storage/publishingDraftRepository', () => ({
  publishingDraftRepository: {
    getGeneration: () => 0,
    read: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccount = { me: { id: 'A', url_token: 'a' }, cookies: 'synthetic' };
  mockVersion = 0;
  jest.mocked(publishingDraftRepository.read).mockResolvedValue(null);
  jest.mocked(publishingDraftRepository.save).mockResolvedValue(undefined);
  jest.mocked(publishingDraftRepository.remove).mockResolvedValue(undefined);
});

test('restores only the selected account and hides the previous draft during loading', async () => {
  const a = { ...emptyPublishingDraft(), content: '合成 A 草稿' };
  let finishB: (value: PublishingDraftValue | null) => void = () => {};
  jest
    .mocked(publishingDraftRepository.read)
    .mockResolvedValueOnce(a)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishB = resolve;
        }),
    );
  const host = await renderHook(
    (_props: { generation: number }) => usePublishingDraft('article', 'new'),
    { initialProps: { generation: 0 } },
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  expect(host.result.current.value.content).toBe(a.content);
  mockAccount = { me: { id: 'B', url_token: 'b' }, cookies: 'synthetic-next' };
  mockVersion += 1;
  await host.rerender({ generation: 1 });
  expect(host.result.current.ready).toBe(false);
  expect(host.result.current.value.content).toBe('');
  await act(() =>
    finishB({ ...emptyPublishingDraft(), content: '合成 B 草稿' }),
  );
  expect(host.result.current.value.content).toBe('合成 B 草稿');
  expect(publishingDraftRepository.read).toHaveBeenLastCalledWith(
    expect.objectContaining({
      accountKey: 'id:B',
      kind: 'article',
      target: 'new',
    }),
  );
  await host.unmount();
});

test('save failure prevents leaving, and a successful retry permits the original action', async () => {
  const host = await renderHook(() => usePublishingDraft('question', 'new'));
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() => host.result.current.update({ title: '合成问题草稿' }));
  expect(mockPrevent.enabled).toBe(true);
  jest
    .mocked(publishingDraftRepository.save)
    .mockRejectedValueOnce(new Error('synthetic disk failure'))
    .mockResolvedValueOnce(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  await act(async () => {
    alert.mock.calls[0][2]
      ?.find((button) => button.text === '保存并离开')
      ?.onPress?.();
  });
  expect(mockRepeat).not.toHaveBeenCalled();
  expect(mockPrevent.enabled).toBe(true);
  expect(host.result.current.status).toBe('failed');
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  await act(async () => {
    alert.mock.calls[1][2]
      ?.find((button) => button.text === '保存并离开')
      ?.onPress?.();
  });
  expect(mockRepeat).toHaveBeenCalledTimes(1);
  expect(mockPrevent.enabled).toBe(false);
  expect(publishingDraftRepository.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ accountKey: 'id:A' }),
    expect.objectContaining({ title: '合成问题草稿' }),
  );
  alert.mockRestore();
  await host.unmount();
});

test('discard repeats the blocked navigation only after cleanup succeeds', async () => {
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() =>
    host.result.current.update({ content: '确认放弃的合成草稿' }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let finishCleanup: () => void = () => {};
  jest.mocked(publishingDraftRepository.remove).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCleanup = resolve;
      }),
  );
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  await act(() => {
    alert.mock.calls[0][2]
      ?.find((button) => button.text === '放弃草稿')
      ?.onPress?.();
  });
  expect(mockPrevent.enabled).toBe(true);
  expect(mockRepeat).not.toHaveBeenCalled();
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  expect(mockRepeat).not.toHaveBeenCalled();
  await act(() => finishCleanup());
  expect(mockPrevent.enabled).toBe(false);
  expect(mockRepeat).toHaveBeenCalledTimes(1);
  alert.mockRestore();
  await host.unmount();
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
});

test('old base revision requires explicit restoration instead of silently replacing the current answer', async () => {
  const old = {
    ...emptyPublishingDraft(),
    document: createPublishingDocument('<table><tr><td>旧版</td></tr></table>'),
    content: '本地增补',
  };
  const initial = {
    ...emptyPublishingDraft(),
    document: createPublishingDocument('<table><tr><td>新版</td></tr></table>'),
  };
  jest.mocked(publishingDraftRepository.read).mockResolvedValueOnce(old);
  const host = await renderHook(() =>
    usePublishingDraft('answer', 'q:a', initial),
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  expect(host.result.current.value).toEqual(initial);
  expect(host.result.current.hasConflict).toBe(true);
  await act(() => host.result.current.update({ content: '不应覆盖旧草稿' }));
  await act(() => host.result.current.save());
  expect(host.result.current.value).toEqual(initial);
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(() => host.result.current.restoreConflict());
  expect(host.result.current.value).toEqual(initial);
  await act(() => {
    alert.mock.calls[0][2]
      ?.find((button) => button.text === '恢复草稿')
      ?.onPress?.();
  });
  expect(host.result.current.value).toEqual(old);
  alert.mockRestore();
  await host.unmount();
});

test('published submissions remain successful when local draft cleanup fails', async () => {
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() =>
    host.result.current.update({ content: '已成功发布的合成正文' }),
  );
  jest
    .mocked(publishingDraftRepository.remove)
    .mockRejectedValueOnce(new Error('synthetic disk failure'));
  await act(() => host.result.current.completePublished());
  expect(mockDisablePrevention).toHaveBeenCalledTimes(1);
  expect(mockPrevent.enabled).toBe(false);
  expect(showToast).toHaveBeenCalledWith(
    '发布已成功，但本地草稿清理失败，请勿重复发布',
  );
  const saves = jest.mocked(publishingDraftRepository.save).mock.calls.length;
  await host.unmount();
  expect(publishingDraftRepository.save).toHaveBeenCalledTimes(saves);
});

test('discard blocks saving during cleanup, keeps departure blocked on failure, and allows retry', async () => {
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() => host.result.current.update({ content: '待放弃的合成草稿' }));
  let failCleanup: (error: Error) => void = () => {};
  jest.mocked(publishingDraftRepository.remove).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        failCleanup = reject;
      }),
  );
  const removing = host.result.current.complete();
  const failed = expect(removing).rejects.toThrow('synthetic disk failure');
  await act(() => host.result.current.save());
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
  await act(async () => {
    failCleanup(new Error('synthetic disk failure'));
    await failed;
  });
  await host.rerender({});
  expect(mockPrevent.enabled).toBe(true);
  await act(() => host.result.current.complete());
  await host.unmount();
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
});

test('an authenticated session without loaded identity never uses a guest draft bucket', async () => {
  mockAccount.me.id = '';
  mockAccount.me.url_token = '';
  const host = await renderHook(() => usePublishingDraft('pin', 'new'));
  expect(host.result.current.scope).toBeNull();
  expect(host.result.current.ready).toBe(false);
  await act(() => host.result.current.save());
  expect(publishingDraftRepository.read).not.toHaveBeenCalled();
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
  await host.unmount();
});

test('unmount flushes edits made within the autosave debounce into their original account', async () => {
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() =>
    host.result.current.update({ content: '尚未到自动保存时间的合成草稿' }),
  );
  await host.unmount();
  expect(publishingDraftRepository.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ accountKey: 'id:A' }),
    expect.objectContaining({ content: '尚未到自动保存时间的合成草稿' }),
  );
});

test('a failed read blocks editing and saving until retry restores the stored draft', async () => {
  const stored = { ...emptyPublishingDraft(), content: '尚未读取的原有草稿' };
  jest
    .mocked(publishingDraftRepository.read)
    .mockRejectedValueOnce(new Error('synthetic read failure'))
    .mockResolvedValueOnce(stored);
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.readFailed).toBe(true));
  expect(host.result.current.ready).toBe(false);
  await act(() => host.result.current.update({ content: '不能覆盖原草稿' }));
  await act(() => host.result.current.save());
  expect(publishingDraftRepository.save).not.toHaveBeenCalled();
  await act(() => host.result.current.retryRead());
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  expect(host.result.current.value.content).toBe(stored.content);
  expect(host.result.current.readFailed).toBe(false);
  await host.unmount();
});

test('same-account session changes create a fresh scope and flush the previous editor', async () => {
  const host = await renderHook(
    (_props: { revision: number }) => usePublishingDraft('article', 'new'),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() => host.result.current.update({ content: '同账号之前的编辑' }));
  const oldKey = host.result.current.scopeKey;
  mockVersion += 1;
  await host.rerender({ revision: 1 });
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  expect(host.result.current.scopeKey).not.toBe(oldKey);
  expect(publishingDraftRepository.read).toHaveBeenCalledTimes(2);
  expect(publishingDraftRepository.save).toHaveBeenCalledWith(
    expect.objectContaining({ sessionVersion: 0 }),
    expect.objectContaining({ content: '同账号之前的编辑' }),
  );
  await host.unmount();
});

test('pending server submission blocks departure until the result has been confirmed', async () => {
  const host = await renderHook(
    ({ submitting }: { submitting: boolean }) =>
      usePublishingDraft('article', 'new', undefined, true, false, submitting),
    { initialProps: { submitting: true } },
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  expect(mockPrevent.enabled).toBe(true);
  expect(alert).toHaveBeenCalledWith('正在提交', expect.any(String));
  expect(mockRepeat).not.toHaveBeenCalled();
  expect(publishingDraftRepository.remove).not.toHaveBeenCalled();
  await host.rerender({ submitting: false });
  expect(mockPrevent.enabled).toBe(false);
  alert.mockRestore();
  await host.unmount();
});

test('unreadable draft removal requires confirmation and keeps editing blocked if cleanup fails', async () => {
  jest
    .mocked(publishingDraftRepository.read)
    .mockRejectedValueOnce(new Error('synthetic corruption'));
  const host = await renderHook(() => usePublishingDraft('article', 'new'));
  await waitFor(() => expect(host.result.current.readFailed).toBe(true));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(() => host.result.current.discardUnreadable());
  expect(publishingDraftRepository.remove).not.toHaveBeenCalled();
  jest
    .mocked(publishingDraftRepository.remove)
    .mockRejectedValueOnce(new Error('synthetic disk failure'));
  await act(async () =>
    alert.mock.calls[0][2]
      ?.find((button) => button.text === '删除本地草稿')
      ?.onPress?.(),
  );
  expect(host.result.current.ready).toBe(false);
  expect(host.result.current.readFailed).toBe(true);
  await act(() => host.result.current.discardUnreadable());
  await act(async () =>
    alert.mock.calls[1][2]
      ?.find((button) => button.text === '删除本地草稿')
      ?.onPress?.(),
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  expect(host.result.current.value.content).toBe('');
  alert.mockRestore();
  await host.unmount();
});

test('a previous account confirmation cannot discard a draft or navigate the new account', async () => {
  const host = await renderHook(
    (_props: { revision: number }) => usePublishingDraft('article', 'new'),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() => host.result.current.update({ content: '账号 A 待确认草稿' }));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(() => mockPrevent.callback({ repeat: mockRepeat }));
  const discard = alert.mock.calls[0][2]?.find(
    (button) => button.text === '放弃草稿',
  );
  mockAccount = { me: { id: 'B', url_token: 'b' }, cookies: 'synthetic-next' };
  mockVersion += 1;
  await host.rerender({ revision: 1 });
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(async () => discard?.onPress?.());
  expect(publishingDraftRepository.remove).not.toHaveBeenCalled();
  expect(mockRepeat).not.toHaveBeenCalled();
  alert.mockRestore();
  await host.unmount();
});

test('a previous account publication cannot disable the current draft departure guard', async () => {
  const host = await renderHook(
    (_props: { revision: number }) => usePublishingDraft('article', 'new'),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  const completePreviousPublication = host.result.current.completePublished;
  mockAccount = { me: { id: 'B', url_token: 'b' }, cookies: 'synthetic-next' };
  mockVersion += 1;
  await host.rerender({ revision: 1 });
  await waitFor(() => expect(host.result.current.ready).toBe(true));
  await act(() => host.result.current.update({ content: '账号 B 的新草稿' }));
  await act(() => completePreviousPublication());
  expect(mockPrevent.enabled).toBe(true);
  expect(mockDisablePrevention).not.toHaveBeenCalled();
  expect(publishingDraftRepository.remove).toHaveBeenCalledWith(
    expect.objectContaining({ accountKey: 'id:A' }),
  );
  await act(() => host.result.current.save());
  expect(publishingDraftRepository.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ accountKey: 'id:B' }),
    expect.objectContaining({ content: '账号 B 的新草稿' }),
  );
  await host.unmount();
});
