import client from '../src/api/client';
import {
  createPin,
  deletePin,
  getPinDraft,
  parsePinDraft,
  savePinDraft,
  updatePin,
} from '../src/api/zhihu/pin';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'synthetic-trace' }));

const html = '<p>合成想法 &amp; 内容</p><p><br></p>';
const image = {
  url: 'https://image.example/preview.jpg',
  originalUrl: 'https://image.example/original.png',
  watermarkUrl: 'https://image.example/watermarked.png',
  watermark: 'watermark',
  width: 120,
  height: 240,
  caption: '保留的图片说明',
};
const plugin = {
  hybrid: { html, textLength: 8, layout: 'original' },
  title: { title: '合成标题', custom: 'original' },
  media: { medias: [{ image }], layout: 'gallery' },
  commentsPermission: { comment_permission: 'self', keep: true },
  extra_info: { view_permission: 'all', publisher: 'pc', keep: true },
  publish: { traceId: 'old-trace', keep: true },
  preserved: { payload: 'original' },
};
const envelope = (value: unknown = plugin) => ({
  code: 0,
  data: {
    object_type: 'pin',
    content_id: '42',
    draft_plugin: JSON.stringify(value),
    online_plugin: JSON.stringify({ ...plugin, title: { title: '线上版本' } }),
  },
});
const published = { data: { result: JSON.stringify({ id: '42' }) } };
const post = jest.mocked(client.post);

beforeEach(() => jest.clearAllMocks());

test('loads the content plugin with cancellation and preserves complete image and source metadata', async () => {
  jest.mocked(client.get).mockResolvedValueOnce({ data: envelope() });
  const controller = new AbortController();
  const draft = await getPinDraft('42', { signal: controller.signal });
  expect(client.get).toHaveBeenCalledWith(
    'https://www.zhihu.com/content/plugin/42?action=pin',
    { signal: controller.signal },
  );
  expect(draft).toEqual({
    id: '42',
    title: '合成标题',
    html,
    images: [
      {
        imageId: 'pin-42-0',
        src: image.url,
        originalSrc: image.originalUrl,
        watermarkSrc: image.watermarkUrl,
        watermark: image.watermark,
        width: image.width,
        height: image.height,
      },
    ],
    sourceData: plugin,
  });
});

test('uses the online plugin when no draft plugin exists, including text-only pins', () => {
  const textOnly = { ...plugin, media: { medias: [] } };
  const response = envelope(textOnly);
  expect(
    parsePinDraft(
      {
        ...response,
        data: {
          ...response.data,
          draft_plugin: '',
          online_plugin: JSON.stringify(textOnly),
        },
      },
      '42',
    ).images,
  ).toEqual([]);
});

test('online picture media retains its mediaType and image metadata through saving', async () => {
  const online = {
    ...plugin,
    media: { medias: [{ image, mediaType: 'Picture' }] },
  };
  const response = envelope();
  const draft = parsePinDraft(
    {
      ...response,
      data: {
        ...response.data,
        draft_plugin: '',
        online_plugin: JSON.stringify(online),
      },
    },
    '42',
  );
  expect(draft.sourceData).toEqual(online);
  expect(draft.images[0].src).toBe(image.url);
  post.mockResolvedValueOnce({ data: { code: 0, data: { content_id: '42' } } });
  await savePinDraft(draft.html, {
    pinId: draft.id,
    title: draft.title,
    images: draft.images,
    sourceData: draft.sourceData,
  });
  expect(post.mock.calls[0][1]).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({ media: online.media }),
    }),
  );
});

test.each([
  null,
  { ...envelope(), code: 1 },
  { ...envelope(), data: { ...envelope().data, content_id: '43' } },
  { ...envelope(), data: { ...envelope().data, object_type: 'article' } },
  { ...envelope(), data: { ...envelope().data, draft_plugin: '{broken' } },
  envelope(null),
  envelope({ ...plugin, hybrid: {} }),
  envelope({ ...plugin, media: {} }),
  envelope({ ...plugin, title: {} }),
])(
  'fails closed for malformed or unrelated plugin responses: %j',
  (response) => {
    expect(() => parsePinDraft(response, '42')).toThrow();
  },
);

test.each([
  { video: { id: 'synthetic-video' } },
  { image, video: { id: 'synthetic-video' } },
  { image, mediaType: 'Picture', video: { id: 'synthetic-video' } },
  { image, mediaType: 'Video' },
  { image, mediaType: null },
  { link: { url: 'https://example.com' } },
  { image: { ...image, width: 0 } },
  { image: { ...image, height: -1 } },
  { image: { ...image, width: '120' } },
  { image: { ...image, url: 'https://' } },
  { image: { ...image, originalUrl: 'javascript:synthetic' } },
  {
    image: {
      ...image,
      watermarkUrl: 'https://user:secret@image.example/a.png',
    },
  },
  { image: { ...image, watermark: null } },
])('refuses unsupported or damaged media without dropping it: %j', (media) => {
  expect(() =>
    parsePinDraft(
      envelope({
        ...plugin,
        media: { medias: [media] },
      }),
      '42',
    ),
  ).toThrow('此想法包含暂不支持的媒体');
});

test('creates a new cloud draft without published flags and returns its content ID', async () => {
  post.mockResolvedValueOnce({ data: { code: 0, data: { content_id: '42' } } });
  await expect(savePinDraft(html, { title: ' 合成标题 ' })).resolves.toBe('42');
  expect(post).toHaveBeenCalledWith('https://api.zhihu.com/content/drafts', {
    action: 'pin',
    data: {
      draft: { disabled: 1 },
      commentsPermission: { comment_permission: 'all' },
      extra_info: { view_permission: 'all', publisher: 'pc' },
      hybrid: { html, textLength: 9 },
      media: { medias: [] },
      publish: { traceId: expect.stringMatching(/,synthetic-trace$/) },
      title: { title: '合成标题' },
    },
  });
});

test.each([
  { options: { draftId: '42' }, isPublished: false },
  { options: { pinId: '42', draftId: 'old-draft' }, isPublished: true },
])(
  'saves existing drafts and published edits with explicit publication state: %j',
  async ({ options, isPublished }) => {
    post.mockResolvedValueOnce({ data: { code: 0 } });
    await expect(savePinDraft(html, options)).resolves.toBe('42');
    expect(post).toHaveBeenCalledWith(
      'https://api.zhihu.com/content/drafts',
      expect.objectContaining({
        data: expect.objectContaining({
          draft: { disabled: 1, id: '42', isPublished },
        }),
      }),
    );
  },
);

test('saving edited content preserves source settings, HTML extras and retained image metadata', async () => {
  const draft = parsePinDraft(envelope(), '42');
  post.mockResolvedValueOnce({ data: { code: 0, data: { content_id: '42' } } });
  await savePinDraft('<p>新正文</p>', {
    pinId: draft.id,
    images: draft.images,
    title: '新标题',
    sourceData: draft.sourceData,
  });
  expect(post.mock.calls[0][1]).toEqual({
    action: 'pin',
    data: {
      ...plugin,
      draft: { disabled: 1, id: '42', isPublished: true },
      title: { ...plugin.title, title: '新标题' },
      hybrid: { ...plugin.hybrid, html: '<p>新正文</p>', textLength: 3 },
      publish: {
        ...plugin.publish,
        traceId: expect.stringMatching(/,synthetic-trace$/),
      },
    },
  });
  expect(draft.sourceData).toEqual(plugin);
});

test('new publishing creates its draft first and reuses its ID in the publish request', async () => {
  post.mockResolvedValueOnce({ data: { code: 0, data: { content_id: '42' } } });
  post.mockResolvedValueOnce({ data: published });
  await expect(createPin(html)).resolves.toEqual({ id: '42' });
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0][0]).toBe('https://api.zhihu.com/content/drafts');
  expect(post.mock.calls[1]).toEqual([
    '/content/publish',
    expect.objectContaining({
      data: expect.objectContaining({
        draft: { disabled: 1, id: '42', isPublished: false },
      }),
    }),
  ]);
});

test('publishing a saved cloud draft does not create another draft', async () => {
  post.mockResolvedValueOnce({ data: published });
  await createPin(html, { draftId: '42' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/content/publish',
    expect.objectContaining({
      data: expect.objectContaining({
        draft: { disabled: 1, id: '42', isPublished: false },
      }),
    }),
  );
});

test('updating a published pin targets that pin directly and never creates a new draft', async () => {
  post.mockResolvedValueOnce({ data: published });
  await updatePin('42', html, { draftId: 'old-draft' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/content/publish',
    expect.objectContaining({
      data: expect.objectContaining({
        draft: { disabled: 1, id: '42', isPublished: true },
      }),
    }),
  );
});

test.each([
  { code: 1, data: { content_id: '42' } },
  { code: 0, data: {} },
])('failed draft creation cannot proceed to publishing: %j', async (data) => {
  post.mockResolvedValueOnce({ data });
  await expect(createPin(html)).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
});

test('deletes only the selected pin and propagates request failures', async () => {
  jest.mocked(client.delete).mockResolvedValueOnce({ data: {} });
  await deletePin('42');
  expect(client.delete).toHaveBeenCalledWith('/pins/42');
  const failure = new Error('synthetic failure');
  jest.mocked(client.delete).mockRejectedValueOnce(failure);
  await expect(deletePin('42/other')).rejects.toBe(failure);
  expect(client.delete).toHaveBeenLastCalledWith('/pins/42%2Fother');
});
