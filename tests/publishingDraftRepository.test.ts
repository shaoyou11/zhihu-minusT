import * as FileSystem from 'expo-file-system/legacy';
import { emptyPublishingDraft } from '../src/features/publishing/types';
import { publishingDraftRepository } from '../src/storage/publishingDraftRepository';

const mockRows = new Map<string, string>();
const mockDatabase = {
  getFirstAsync: jest.fn(async (_sql: string, params: string[]) => {
    const value = mockRows.get(params.join('|'));
    return value ? { value_json: value } : null;
  }),
  runAsync: jest.fn(async (sql: string, params: Array<string | number>) => {
    if (sql.startsWith('INSERT'))
      mockRows.set(`${params[0]}|${params[1]}`, String(params[2]));
    else if (params.length === 1)
      for (const key of mockRows.keys()) {
        if (key.startsWith(`${params[0]}|`)) mockRows.delete(key);
      }
    else mockRows.delete(`${params[0]}|${params[1]}`);
  }),
};
jest.mock('../src/storage/localDatabase', () => ({
  localDatabase: {
    run: (operation: (database: typeof mockDatabase) => Promise<unknown>) =>
      operation(mockDatabase),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///synthetic/',
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
const a = { accountKey: 'id:A', kind: 'article' as const, target: 'new' };
const b = { ...a, accountKey: 'id:B' };

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.clear();
});

test('round-trips account-scoped drafts and restores interrupted uploads as failed', async () => {
  const asset = await publishingDraftRepository.retainAsset(a, 'media-1', {
    uri: 'file:///temporary.jpg',
    width: 10,
    height: 20,
  });
  const value = {
    ...emptyPublishingDraft(),
    content: '合成草稿',
    media: [{ id: 'media-1', asset, status: 'uploading' as const }],
  };
  await publishingDraftRepository.save(a, value);
  expect(await publishingDraftRepository.read(b)).toBeNull();
  expect(await publishingDraftRepository.read(a)).toEqual({
    ...value,
    media: [expect.objectContaining({ status: 'failed', asset })],
  });
  await publishingDraftRepository.clearAccount('id:A');
  expect(await publishingDraftRepository.read(a)).toBeNull();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});

test('guest and unbound drafts cannot be persisted, and cleanup never removes foreign paths', async () => {
  await expect(
    publishingDraftRepository.save(
      { ...a, accountKey: 'guest' },
      emptyPublishingDraft(),
    ),
  ).rejects.toThrow();
  await publishingDraftRepository.releaseAsset(
    a,
    'file:///synthetic/auth-storage.json',
  );
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});

test('account removal during asset retention removes the late file', async () => {
  let finishCopy: () => void = () => {};
  jest.mocked(FileSystem.copyAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCopy = resolve;
      }),
  );
  const retaining = publishingDraftRepository.retainAsset(a, 'media-2', {
    uri: 'file:///temporary.jpg',
    width: 10,
    height: 20,
  });
  await Promise.resolve();
  await publishingDraftRepository.clearAccount('id:A');
  finishCopy();
  await expect(retaining).rejects.toThrow('账号已移除');
  expect(FileSystem.deleteAsync).toHaveBeenLastCalledWith(
    expect.stringContaining('media-2.image'),
    { idempotent: true },
  );
});

test('a stale editor token cannot recreate the draft after account removal', async () => {
  const oldScope = {
    ...a,
    generation: publishingDraftRepository.getGeneration(a.accountKey),
  };
  await publishingDraftRepository.clearAccount(a.accountKey);
  await publishingDraftRepository.save(oldScope, {
    ...emptyPublishingDraft(),
    content: '旧页面晚保存',
  });
  expect(await publishingDraftRepository.read(a)).toBeNull();
});

test.each(['{broken', '{"version":7,"value":{}}', '{"version":1,"value":{}}'])(
  'an unreadable stored row stays intact and fails closed: %s',
  async (stored) => {
    const key = `${a.accountKey}|article:new`;
    mockRows.set(key, stored);
    await expect(publishingDraftRepository.read(a)).rejects.toThrow(
      '草稿内容暂时无法读取',
    );
    expect(mockRows.get(key)).toBe(stored);
    expect(mockDatabase.runAsync).not.toHaveBeenCalled();
  },
);

test('version 1 local drafts migrate in memory and are saved with version 2 without losing content', async () => {
  const scope = { ...a, kind: 'pin' as const };
  const key = `${scope.accountKey}|pin:new`;
  const legacy = {
    ...emptyPublishingDraft(),
    title: '合成旧标题',
    content: '合成旧正文',
  };
  const stored = JSON.stringify({ version: 1, value: legacy });
  mockRows.set(key, stored);
  const restored = await publishingDraftRepository.read(scope);
  expect(restored).toEqual(legacy);
  expect(mockRows.get(key)).toBe(stored);
  expect(mockDatabase.runAsync).not.toHaveBeenCalled();
  if (!restored) throw new Error('expected a restored draft');
  await publishingDraftRepository.save(scope, {
    ...restored,
    pinDraftId: '42',
  });
  expect(JSON.parse(mockRows.get(key) ?? 'null')).toEqual({
    version: 2,
    value: { ...legacy, pinDraftId: '42' },
  });
  expect(await publishingDraftRepository.read(scope)).toEqual({
    ...legacy,
    pinDraftId: '42',
  });
  expect(
    await publishingDraftRepository.read({ ...scope, accountKey: 'id:B' }),
  ).toBeNull();
});

test('version 2 preserves pin image sources and supports drafts without a cloud ID', async () => {
  const scope = { ...a, kind: 'pin' as const };
  const value = {
    ...emptyPublishingDraft(),
    images: [
      {
        imageId: 'synthetic-image',
        src: 'https://image.example/preview.jpg',
        originalSrc: 'https://image.example/original.png',
        watermark: 'watermark',
        watermarkSrc: 'https://image.example/watermarked.jpg',
        width: 120,
        height: 240,
      },
    ],
  };
  await publishingDraftRepository.save(scope, value);
  expect(await publishingDraftRepository.read(scope)).toEqual(value);
});

test('cloud pin source permissions and extended media metadata survive a local save and reload', async () => {
  const scope = { ...a, kind: 'pin' as const };
  const value = {
    ...emptyPublishingDraft(),
    pinDraftId: '42',
    pinSourceData: {
      commentsPermission: { comment_permission: 'self' },
      extra_info: { view_permission: 'self', publisher: 'pc' },
      hybrid: { html: '<p>合成云草稿</p>', textLength: 5 },
      title: { title: '合成标题' },
      media: {
        medias: [
          {
            mediaType: 'Picture',
            image: {
              url: 'https://image.example/preview.jpg',
              caption: '原始图片说明',
              width: 120,
              height: 240,
            },
          },
        ],
      },
    },
  };
  await publishingDraftRepository.save(scope, value);
  expect(await publishingDraftRepository.read(scope)).toEqual(value);
  expect(
    JSON.parse(mockRows.get(`${scope.accountKey}|pin:new`) ?? 'null'),
  ).toEqual({
    version: 2,
    value,
  });
});

test.each([null, [], 'corrupted', 42, true])(
  'damaged cloud pin source metadata is retained on disk and blocks restoration: %j',
  async (pinSourceData) => {
    const scope = { ...a, kind: 'pin' as const };
    const key = `${scope.accountKey}|pin:new`;
    const stored = JSON.stringify({
      version: 2,
      value: { ...emptyPublishingDraft(), pinSourceData },
    });
    mockRows.set(key, stored);
    await expect(publishingDraftRepository.read(scope)).rejects.toThrow(
      '草稿内容暂时无法读取',
    );
    expect(mockRows.get(key)).toBe(stored);
    expect(mockDatabase.runAsync).not.toHaveBeenCalled();
  },
);

test.each([null, '', '0', '42/other', 42, {}, ' 42'])(
  'invalid cloud draft IDs fail closed while preserving the stored row: %j',
  async (pinDraftId) => {
    const scope = { ...a, kind: 'pin' as const };
    const key = `${scope.accountKey}|pin:new`;
    const stored = JSON.stringify({
      version: 2,
      value: { ...emptyPublishingDraft(), pinDraftId },
    });
    mockRows.set(key, stored);
    await expect(publishingDraftRepository.read(scope)).rejects.toThrow(
      '草稿内容暂时无法读取',
    );
    expect(mockRows.get(key)).toBe(stored);
    expect(mockDatabase.runAsync).not.toHaveBeenCalled();
  },
);
