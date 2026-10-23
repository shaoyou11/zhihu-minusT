import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import apiClient from '../src/api/client';
import { uploadImage } from '../src/api/zhihu/image';
import { getZhihuErrorMessage } from '../src/utils/zhihuError';

const mockTask = {
  uploadAsync: jest.fn(),
  cancelAsync: jest.fn(async () => {}),
};
const mockCreateTask = jest.fn((..._args: unknown[]) => mockTask);
jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), put: jest.fn(), get: jest.fn() },
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA1' },
  digest: jest.fn(async () => new ArrayBuffer(20)),
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async () => ({ exists: true, md5: 'synthetic-hash' })),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: (...args: unknown[]) => mockCreateTask(...args),
}));
const asset = { uri: 'file:///synthetic.jpg', width: 10, height: 10 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiClient.post).mockResolvedValue({
    data: {
      upload_file: {
        image_id: 'synthetic-image',
        state: 2,
        object_key: 'synthetic-object',
      },
      upload_token: {
        access_id: 'synthetic-id',
        access_key: 'synthetic-key',
        access_token: 'synthetic-token',
      },
    },
  });
});

test('already aborted media does not read a file or create an image', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    uploadImage(asset, 'article', { signal: controller.signal }),
  ).rejects.toBeInstanceOf(axios.CanceledError);
  expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  expect(apiClient.post).not.toHaveBeenCalled();
});

test('aborting object storage upload cancels its native task and prevents later API writes', async () => {
  let finish: (value: null) => void = () => {};
  mockTask.uploadAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const uploading = uploadImage(asset, 'article', {
    signal: controller.signal,
  });
  for (
    let round = 0;
    round < 30 && !mockTask.uploadAsync.mock.calls.length;
    round += 1
  )
    await Promise.resolve();
  expect(mockTask.uploadAsync).toHaveBeenCalledTimes(1);
  controller.abort();
  finish(null);
  await expect(uploading).rejects.toBeInstanceOf(axios.CanceledError);
  expect(mockTask.cancelAsync).toHaveBeenCalledTimes(1);
  expect(apiClient.put).not.toHaveBeenCalled();
  expect(apiClient.get).not.toHaveBeenCalled();
});

test('abort during processing retry does not issue a subsequent image request', async () => {
  jest.mocked(apiClient.post).mockResolvedValueOnce({
    data: { upload_file: { image_id: 'synthetic-image', state: 1 } },
  });
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({ data: { status: 'processing' } });
  const controller = new AbortController();
  const uploading = uploadImage(asset, 'article', {
    signal: controller.signal,
  });
  for (
    let round = 0;
    round < 30 && !jest.mocked(apiClient.get).mock.calls.length;
    round += 1
  )
    await Promise.resolve();
  expect(apiClient.get).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(uploading).rejects.toBeInstanceOf(axios.CanceledError);
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});

test.each([
  ['SignatureDoesNotMatch', 403, '图片上传校验失败，请重新上传'],
  ['SecurityTokenExpired', 403, '图片上传凭证已过期，请重新上传'],
  ['EntityTooLarge', 413, '图片过大，请选择较小的图片'],
  ['RequestTimeout', 408, '图片上传超时，请检查网络后重试'],
  ['SlowDown', 429, '图片上传请求过多，请稍后重试'],
  ['InternalError', 500, '图片上传服务暂时不可用，请稍后重试'],
  ['constructor', 400, '图片上传失败，请稍后重试'],
  ['syntheticUnknownCode', 403, '图片上传凭证无效，请重新登录后重试'],
] as const)(
  'OSS %s retains a fixed explanation and never includes echoed credentials or request IDs',
  async (code, status, expected) => {
    mockTask.uploadAsync.mockResolvedValueOnce({
      status,
      body: `<Error><Code>${code}</Code><Message>Cookie z_c0=synthetic-private; https://example.invalid/?token=synthetic-private</Message><RequestId>synthetic-request-id</RequestId></Error>`,
      headers: { 'x-oss-request-id': 'synthetic-header-request-id' },
    });
    let failure: unknown;
    try {
      await uploadImage(asset);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(expected);
    expect(getZhihuErrorMessage(failure)).toBe(expected);
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
  },
);
