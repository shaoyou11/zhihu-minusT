import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { uploadImage } from '../src/api/zhihu/image';
import type { PublishingMediaItem } from '../src/features/publishing/types';
import { usePublishingMedia } from '../src/features/publishing/usePublishingMedia';
import { publishingDraftRepository } from '../src/storage/publishingDraftRepository';

jest.mock('../src/api/zhihu/image', () => ({ uploadImage: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../src/storage/publishingDraftRepository', () => ({
  publishingDraftRepository: {
    retainAsset: jest.fn(async (_scope, id, asset) => ({
      ...asset,
      uri: `file:///synthetic-draft/${id}.image`,
    })),
    releaseAsset: jest.fn(async () => {}),
  },
}));
let mockSession = 0;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
}));
const scope = {
  accountKey: 'id:synthetic',
  kind: 'article' as const,
  target: 'new',
};
const image = {
  imageId: 'synthetic',
  src: 'https://example.com/image.jpg',
  width: 10,
  height: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = 0;
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({
      granted: true,
    } as ImagePicker.MediaLibraryPermissionResponse);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///synthetic-source.jpg', width: 10, height: 10 }],
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('failed media persists and a double retry starts only one upload', async () => {
  let finish: (value: typeof image) => void = () => {};
  jest
    .mocked(uploadImage)
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const onChange = jest.fn();
  const host = await renderHook(() => usePublishingMedia({ scope, onChange }));
  await act(() => host.result.current.chooseImages());
  await waitFor(() => expect(host.result.current.failedCount).toBe(1));
  const failed = host.result.current.items[0];
  expect(failed.asset.uri).toContain('synthetic-draft');
  expect(host.result.current.isBusy).toBe(true);
  expect(host.result.current.isWorking).toBe(false);
  await act(() => {
    host.result.current.retry(failed.id);
    host.result.current.retry(failed.id);
  });
  expect(uploadImage).toHaveBeenCalledTimes(2);
  expect(host.result.current.isWorking).toBe(true);
  await act(() => finish(image));
  expect(host.result.current.items[0].uploaded).toEqual(image);
  expect(host.result.current.isBusy).toBe(false);
  expect(host.result.current.isWorking).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ status: 'uploaded' }),
  ]);
  await host.unmount();
});

test('removed media aborts and cannot reappear after late completion', async () => {
  let finish: (value: typeof image) => void = () => {};
  jest.mocked(uploadImage).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onUploaded = jest.fn();
  const host = await renderHook(() =>
    usePublishingMedia({ scope, onUploaded }),
  );
  await act(() => host.result.current.chooseImages());
  const id = host.result.current.items[0].id;
  const signal = jest.mocked(uploadImage).mock.calls[0][2]?.signal;
  await act(() => host.result.current.remove(id));
  expect(signal?.aborted).toBe(true);
  await act(() => finish(image));
  expect(host.result.current.items).toEqual([]);
  expect(onUploaded).not.toHaveBeenCalled();
  expect(publishingDraftRepository.releaseAsset).toHaveBeenCalled();
  await host.unmount();
});

test('restored interrupted media is retryable and does not upload under another session', async () => {
  const initial: PublishingMediaItem[] = [
    {
      id: 'restored',
      asset: {
        uri: 'file:///synthetic-draft/restored.image',
        width: 10,
        height: 10,
      },
      status: 'uploading',
    },
  ];
  const host = await renderHook(() =>
    usePublishingMedia({ scope, initialItems: initial }),
  );
  expect(host.result.current.failedCount).toBe(1);
  mockSession += 1;
  await act(() => host.result.current.retry('restored'));
  expect(uploadImage).not.toHaveBeenCalled();
  await host.unmount();
});

test('a batch never runs more than three uploads at once', async () => {
  const pending: Array<(value: typeof image) => void> = [];
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: Array.from({ length: 5 }, (_, index) => ({
      uri: `file:///synthetic-${index}.jpg`,
      width: 10,
      height: 10,
    })),
  });
  jest
    .mocked(uploadImage)
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const host = await renderHook(() => usePublishingMedia({ scope }));
  await act(() => host.result.current.chooseImages());
  expect(uploadImage).toHaveBeenCalledTimes(3);
  await act(() => pending[0](image));
  expect(uploadImage).toHaveBeenCalledTimes(4);
  await host.unmount();
  expect(jest.mocked(uploadImage).mock.calls[1][2]?.signal?.aborted).toBe(true);
});
