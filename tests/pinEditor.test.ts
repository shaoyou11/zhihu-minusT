import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { UploadedImage } from '../src/api/zhihu/image';
import {
  createPin,
  getPin,
  getPinDraft,
  type PinDraft,
  savePinDraft,
} from '../src/api/zhihu/pin';
import { createPublishingDocument } from '../src/features/publishing/document';
import {
  emptyPublishingDraft,
  type PublishingDraftValue,
} from '../src/features/publishing/types';
import { usePinEditor } from '../src/features/publishing/usePinEditor';

interface EditorQueryOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<PinDraft>;
}

const mockImage: UploadedImage = {
  imageId: 'pin-synthetic-0',
  src: 'https://pic.example/kept.jpg',
  originalSrc: 'https://pic.example/original.jpg',
  watermarkSrc: 'https://pic.example/watermark.jpg',
  watermark: 'watermark',
  width: 640,
  height: 480,
};
const mockRawHtml =
  '<p>原始<strong>正文</strong></p><figure data-keep="yes"><img src="https://pic.example/inline.jpg"></figure>';
const mockCloudDraft: PinDraft = {
  id: 'cloud-draft',
  title: '云端标题',
  html: '<p>云端正文</p><blockquote data-keep="cloud">保留原块</blockquote>',
  images: [mockImage],
  sourceData: { extra_info: { view_permission: 'all', synthetic: true } },
};
let mockInitialValue: PublishingDraftValue | null;
let mockExistingData: PinDraft | undefined;
let mockQueryOptions: EditorQueryOptions;
let mockReady = true;
let mockConflict = false;
let mockSessionVersion = 1;
let mockAccount = {
  me: { id: 'synthetic-owner', url_token: 'synthetic-owner' },
  cookies: 'synthetic-session',
};
const mockSave = jest.fn<Promise<boolean>, [PublishingDraftValue?]>();
const mockComplete = jest.fn<Promise<void>, []>();
const mockUpdate = jest.fn<void, [Partial<PublishingDraftValue>]>();
const mockBack = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../src/api/zhihu/pin', () => ({
  createPin: jest.fn(),
  getPin: jest.fn(),
  getPinDraft: jest.fn(),
  savePinDraft: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: EditorQueryOptions) => {
    mockQueryOptions = options;
    return { data: mockExistingData, isPending: false, isError: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: { getState: () => mockAccount },
}));
jest.mock('../src/features/publishing/usePublishingDraft', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    usePublishingDraft: (
      _kind: string,
      _target: string,
      initial: PublishingDraftValue,
    ) => {
      const [value, setValue] = react.useState(mockInitialValue ?? initial);
      const update = react.useCallback(
        (patch: Partial<PublishingDraftValue>) => {
          mockUpdate(patch);
          setValue((current) => ({ ...current, ...patch }));
        },
        [],
      );
      return {
        value,
        update,
        ready: mockReady,
        hasConflict: mockConflict,
        save: mockSave,
        completePublished: mockComplete,
      };
    },
  };
});

let alert: jest.SpiedFunction<typeof Alert.alert>;

beforeEach(() => {
  jest.clearAllMocks();
  mockInitialValue = {
    ...emptyPublishingDraft(),
    title: '合成标题',
    document: createPublishingDocument(mockRawHtml),
    content: '新增 <文字>',
    images: [mockImage],
    pinDraftId: 'saved-draft',
  };
  mockExistingData = undefined;
  mockReady = true;
  mockConflict = false;
  mockSessionVersion = 1;
  mockAccount = {
    me: { id: 'synthetic-owner', url_token: 'synthetic-owner' },
    cookies: 'synthetic-session',
  };
  mockSave.mockReset().mockResolvedValue(true);
  mockComplete.mockReset().mockResolvedValue(undefined);
  jest.mocked(createPin).mockReset().mockResolvedValue({ id: 'published' });
  jest.mocked(getPinDraft).mockReset().mockResolvedValue(mockCloudDraft);
  jest
    .mocked(savePinDraft)
    .mockReset()
    .mockResolvedValue('created-cloud-draft');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => alert.mockRestore());

function confirmCloudLoad() {
  const confirmation = alert.mock.calls
    .findLast((call) => call[0] === '读取云端草稿？')?.[2]
    ?.find((button) => button.text === '读取')?.onPress;
  expect(confirmation).toBeDefined();
  return confirmation;
}

test('publishes preserved HTML, appended plain text, title, and all media before clearing the local draft', async () => {
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(
    `${mockRawHtml}<p>新增 &lt;文字&gt;</p>`,
    {
      pinId: undefined,
      draftId: 'saved-draft',
      title: '合成标题',
      images: [mockImage],
      sourceData: undefined,
    },
  );
  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(mockComplete.mock.invocationCallOrder[0]).toBeGreaterThan(
    jest.mocked(createPin).mock.invocationCallOrder[0],
  );
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['zhihu-feed'] });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['pin-detail'] });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['user-pins'] });
  expect(mockInvalidate).toHaveBeenCalledWith({
    queryKey: ['user-activities'],
  });
  expect(alert).toHaveBeenCalledWith('发布成功', '你的想法已发布。');
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('editing an existing pin retains the original body, images, title, and source metadata', async () => {
  mockInitialValue = null;
  mockExistingData = { ...mockCloudDraft, html: mockRawHtml };
  const host = await renderHook(() => usePinEditor('existing-pin'));
  await act(() => host.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(mockRawHtml, {
    pinId: 'existing-pin',
    draftId: undefined,
    title: mockCloudDraft.title,
    images: mockCloudDraft.images,
    sourceData: mockCloudDraft.sourceData,
  });
  expect(alert).toHaveBeenCalledWith('修改已保存', '你的想法已更新。');
});

test('saves a cloud draft ID locally and reuses it on the next publication', async () => {
  mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.saveCloud());
  expect(savePinDraft).toHaveBeenCalledWith('<p>合成新想法</p>', {
    pinId: undefined,
    draftId: undefined,
    title: '',
    images: [],
    sourceData: undefined,
  });
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave).toHaveBeenLastCalledWith({
    ...mockInitialValue,
    pinDraftId: 'created-cloud-draft',
  });
  expect(host.result.current.draft.value.pinDraftId).toBe(
    'created-cloud-draft',
  );
  await act(() => host.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(
    '<p>合成新想法</p>',
    expect.objectContaining({ draftId: 'created-cloud-draft' }),
  );
});

test('direct publication of a new pin persists the cloud draft ID before publishing preserved content', async () => {
  mockInitialValue = {
    ...emptyPublishingDraft(),
    ...mockInitialValue,
    pinDraftId: undefined,
  };
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  const html = `${mockRawHtml}<p>新增 &lt;文字&gt;</p>`;
  expect(savePinDraft).toHaveBeenCalledWith(html, {
    pinId: undefined,
    draftId: undefined,
    title: '合成标题',
    images: [mockImage],
    sourceData: undefined,
  });
  expect(mockSave).toHaveBeenCalledWith({
    ...mockInitialValue,
    pinDraftId: 'created-cloud-draft',
  });
  expect(createPin).toHaveBeenCalledWith(
    html,
    expect.objectContaining({
      draftId: 'created-cloud-draft',
      title: '合成标题',
      images: [mockImage],
    }),
  );
  expect(mockSave.mock.invocationCallOrder[0]).toBeGreaterThan(
    jest.mocked(savePinDraft).mock.invocationCallOrder[0],
  );
  expect(jest.mocked(createPin).mock.invocationCallOrder[0]).toBeGreaterThan(
    mockSave.mock.invocationCallOrder[0],
  );
});

test('retrying a failed direct publication reuses its saved cloud draft ID', async () => {
  mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
  jest.mocked(createPin).mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(host.result.current.draft.value.pinDraftId).toBe(
    'created-cloud-draft',
  );
  await act(() => host.result.current.publish());
  expect(savePinDraft).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(createPin).toHaveBeenCalledTimes(2);
  for (const [, options] of jest.mocked(createPin).mock.calls)
    expect(options?.draftId).toBe('created-cloud-draft');
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('a failed local save prevents direct publication while retaining the created cloud draft ID', async () => {
  mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
  mockSave.mockResolvedValueOnce(false);
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(savePinDraft).toHaveBeenCalledTimes(1);
  expect(createPin).not.toHaveBeenCalled();
  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(host.result.current.draft.value.pinDraftId).toBe(
    'created-cloud-draft',
  );
  expect(host.result.current.pending).toBeNull();
});

test('each direct publication retry must persist its cloud draft ID before publishing', async () => {
  mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
  mockSave
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(createPin).not.toHaveBeenCalled();
  expect(host.result.current.draft.value.pinDraftId).toBe(
    'created-cloud-draft',
  );
  await act(() => host.result.current.publish());
  expect(createPin).not.toHaveBeenCalled();
  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  await act(() => host.result.current.publish());
  expect(savePinDraft).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledTimes(3);
  for (const [value] of mockSave.mock.calls)
    expect(value?.pinDraftId).toBe('created-cloud-draft');
  expect(createPin).toHaveBeenCalledTimes(1);
  expect(createPin).toHaveBeenCalledWith(
    '<p>合成新想法</p>',
    expect.objectContaining({ draftId: 'created-cloud-draft' }),
  );
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('a failed cloud draft creation stops direct publication without replacing local content', async () => {
  mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
  jest
    .mocked(savePinDraft)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(createPin).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(host.result.current.draft.value.content).toBe('合成新想法');
  expect(host.result.current.pending).toBeNull();
});

test.each(['account', 'unmount'])(
  'direct publication does not persist a newly created cloud draft or publish after %s changes',
  async (change) => {
    mockInitialValue = { ...emptyPublishingDraft(), content: '合成新想法' };
    let complete: (value: string) => void = () => {};
    jest
      .mocked(savePinDraft)
      .mockImplementationOnce(
        () => new Promise((resolve) => (complete = resolve)),
      );
    const host = await renderHook(() => usePinEditor());
    let pending: Promise<void> | undefined;
    await act(() => {
      pending = host.result.current.publish();
    });
    if (change === 'account') mockSessionVersion += 1;
    else await host.unmount();
    await act(async () => {
      complete('late-cloud-id');
      await pending;
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(createPin).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  },
);

test('does not send a cloud save when the initial local save fails', async () => {
  mockSave.mockResolvedValueOnce(false);
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.saveCloud());
  expect(savePinDraft).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(host.result.current.pending).toBeNull();
});

test('reports a local persistence failure after a cloud save without losing the created ID', async () => {
  mockSave.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.saveCloud());
  expect(host.result.current.draft.value.pinDraftId).toBe(
    'created-cloud-draft',
  );
  expect(alert).toHaveBeenCalledWith(
    '云端草稿已保存',
    '云端已保存，但本地草稿保存失败，请重试本地保存。',
  );
});

test('requires explicit confirmation before replacing local text and media with the cloud draft', async () => {
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.loadCloud());
  expect(getPinDraft).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(() => confirmCloudLoad()?.());
  expect(getPinDraft).toHaveBeenCalledWith('saved-draft');
  expect(host.result.current.draft.value).toMatchObject({
    title: mockCloudDraft.title,
    content: '',
    images: mockCloudDraft.images,
    media: [],
    pinDraftId: 'saved-draft',
    pinSourceData: mockCloudDraft.sourceData,
    document: { originalHtml: mockCloudDraft.html },
  });
  expect(host.result.current.mediaRevision).toBe(1);
  await act(() => host.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(
    mockCloudDraft.html,
    expect.objectContaining({
      images: mockCloudDraft.images,
      sourceData: mockCloudDraft.sourceData,
    }),
  );
});

test('persists cloud source metadata with the local draft and restores it before publishing a new pin', async () => {
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.loadCloud());
  await act(() => confirmCloudLoad()?.());
  await act(() => host.result.current.saveCloud());
  const savedValue = mockSave.mock.calls.at(-1)?.[0];
  expect(savedValue).toMatchObject({
    pinDraftId: 'created-cloud-draft',
    pinSourceData: mockCloudDraft.sourceData,
    images: mockCloudDraft.images,
    title: mockCloudDraft.title,
    document: { originalHtml: mockCloudDraft.html },
  });
  await host.unmount();
  mockInitialValue = savedValue ?? null;
  const restored = await renderHook(() => usePinEditor());
  await act(() => restored.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(mockCloudDraft.html, {
    pinId: undefined,
    draftId: 'created-cloud-draft',
    title: mockCloudDraft.title,
    images: mockCloudDraft.images,
    sourceData: mockCloudDraft.sourceData,
  });
  expect(getPinDraft).toHaveBeenCalledTimes(1);
});

test('keeps cloud-loaded source metadata after replacing the initially loaded version of an existing pin', async () => {
  mockExistingData = {
    ...mockCloudDraft,
    sourceData: { synthetic: 'obsolete-source' },
  };
  const host = await renderHook(() => usePinEditor('existing-pin'));
  await act(() => host.result.current.loadCloud());
  await act(() => confirmCloudLoad()?.());
  await act(() => host.result.current.publish());
  expect(createPin).toHaveBeenCalledWith(
    mockCloudDraft.html,
    expect.objectContaining({ sourceData: mockCloudDraft.sourceData }),
  );
});

test('a failed cloud read leaves local body and media untouched and releases the operation lock', async () => {
  jest
    .mocked(getPinDraft)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await renderHook(() => usePinEditor());
  const previous = host.result.current.draft.value;
  await act(() => host.result.current.loadCloud());
  await act(() => confirmCloudLoad()?.());
  expect(host.result.current.draft.value).toBe(previous);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(host.result.current.pending).toBeNull();
  expect(alert).toHaveBeenCalledWith('草稿加载失败', expect.any(String));
});

test.each(['account', 'unmount'])(
  'an old confirmation cannot load after %s changes',
  async (change) => {
    const host = await renderHook(() => usePinEditor());
    await act(() => host.result.current.loadCloud());
    const confirm = confirmCloudLoad();
    if (change === 'account') mockSessionVersion += 1;
    else await host.unmount();
    await act(() => confirm?.());
    expect(getPinDraft).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  },
);

test.each(['account', 'unmount'])(
  'a late cloud read does not replace content after %s changes',
  async (change) => {
    let complete: (value: PinDraft) => void = () => {};
    jest
      .mocked(getPinDraft)
      .mockImplementationOnce(
        () => new Promise((resolve) => (complete = resolve)),
      );
    const host = await renderHook(() => usePinEditor());
    await act(() => host.result.current.loadCloud());
    await act(() => confirmCloudLoad()?.());
    if (change === 'account') mockSessionVersion += 1;
    else await host.unmount();
    await act(() => complete(mockCloudDraft));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(createPin).not.toHaveBeenCalled();
  },
);

test.each(['account', 'unmount'])(
  'a late cloud save does not persist its ID after %s changes',
  async (change) => {
    let complete: (value: string) => void = () => {};
    jest
      .mocked(savePinDraft)
      .mockImplementationOnce(
        () => new Promise((resolve) => (complete = resolve)),
      );
    const host = await renderHook(() => usePinEditor());
    let pending: Promise<void> | undefined;
    await act(() => {
      pending = host.result.current.saveCloud();
    });
    expect(savePinDraft).toHaveBeenCalledTimes(1);
    if (change === 'account') mockSessionVersion += 1;
    else await host.unmount();
    await act(async () => {
      complete('late-cloud-id');
      await pending;
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  },
);

test.each(['account', 'unmount'])(
  'a late publication does not clear drafts or close the page after %s changes',
  async (change) => {
    let complete: (value: { id: string }) => void = () => {};
    jest
      .mocked(createPin)
      .mockImplementationOnce(
        () => new Promise((resolve) => (complete = resolve)),
      );
    const host = await renderHook(() => usePinEditor());
    let pending: Promise<void> | undefined;
    await act(() => {
      pending = host.result.current.publish();
    });
    if (change === 'account') mockSessionVersion += 1;
    else await host.unmount();
    await act(async () => {
      complete({ id: 'late-pin' });
      await pending;
    });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  },
);

test('rapid publish and cloud save clicks share a synchronous operation lock', async () => {
  let complete: (value: { id: string }) => void = () => {};
  jest
    .mocked(createPin)
    .mockImplementationOnce(
      () => new Promise((resolve) => (complete = resolve)),
    );
  const host = await renderHook(() => usePinEditor());
  let pending: Promise<void> | undefined;
  await act(() => {
    pending = host.result.current.publish();
    void host.result.current.publish();
    void host.result.current.saveCloud();
    host.result.current.loadCloud();
  });
  expect(createPin).toHaveBeenCalledTimes(1);
  expect(savePinDraft).not.toHaveBeenCalled();
  expect(getPinDraft).not.toHaveBeenCalled();
  await act(async () => {
    complete({ id: 'published' });
    await pending;
  });
});

test.each(['media', 'conflict', 'not-ready'])(
  '%s state disables publish and cloud draft operations',
  async (block) => {
    if (block === 'conflict') mockConflict = true;
    if (block === 'not-ready') mockReady = false;
    const host = await renderHook(() => usePinEditor());
    if (block === 'media')
      await act(() => host.result.current.setMediaBusy(true));
    expect(host.result.current.enabled).toBe(false);
    await act(async () => {
      await host.result.current.publish();
      await host.result.current.saveCloud();
      host.result.current.loadCloud();
    });
    expect(createPin).not.toHaveBeenCalled();
    expect(savePinDraft).not.toHaveBeenCalled();
    expect(getPinDraft).not.toHaveBeenCalled();
  },
);

test.each(['media', 'conflict'])(
  'an older confirmation rechecks %s state before reading cloud content',
  async (block) => {
    const host = await renderHook(() => usePinEditor());
    await act(() => host.result.current.loadCloud());
    const confirm = confirmCloudLoad();
    if (block === 'media')
      await act(() => host.result.current.setMediaBusy(true));
    else {
      mockConflict = true;
      await host.rerender({});
    }
    await act(() => confirm?.());
    expect(getPinDraft).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  },
);

test('publication failure retains the editable draft and does not navigate', async () => {
  jest.mocked(createPin).mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await renderHook(() => usePinEditor());
  await act(() => host.result.current.publish());
  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(host.result.current.enabled).toBe(true);
});

test('the editing query verifies ownership before retrieving a mutable cloud draft', async () => {
  const host = await renderHook(() => usePinEditor('someone-elses-pin'));
  const signal = new AbortController().signal;
  jest.mocked(getPin).mockResolvedValueOnce({
    author: { id: 'someone-else' },
  } as Awaited<ReturnType<typeof getPin>>);
  await expect(mockQueryOptions.queryFn({ signal })).rejects.toThrow(
    '只能编辑当前账号发布的想法',
  );
  expect(getPin).toHaveBeenCalledWith('someone-elses-pin', { signal });
  expect(getPinDraft).not.toHaveBeenCalled();
  await host.unmount();
});
