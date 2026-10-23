import { Platform, Share } from 'react-native';
import {
  buildContentShareText,
  resolveContentShareUrl,
  shareContent,
} from '../src/utils/contentActions';
import { showToast } from '../src/utils/toast';

jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));

const initialPlatform = Platform.OS;
const share = jest.spyOn(Share, 'share');

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  share.mockResolvedValue({
    action: Share.sharedAction,
    activityType: undefined,
  });
});

afterEach(() => {
  Platform.OS = initialPlatform;
});

test.each([
  ['answer', 'https://www.zhihu.com/answer/42'],
  ['question', 'https://www.zhihu.com/question/42'],
  ['pin', 'https://www.zhihu.com/pin/42'],
  ['article', 'https://zhuanlan.zhihu.com/p/42'],
  ['video', 'https://www.zhihu.com/zvideo/42'],
  ['daily', 'https://daily.zhihu.com/story/42'],
] as const)('resolves the public %s URL', (type, expected) => {
  expect(resolveContentShareUrl(type, { id: 42 })).toBe(expected);
});

test('uses a question link when known and preserves long string IDs without rounding', () => {
  expect(
    resolveContentShareUrl('answer', {
      id: '19012345678901234567',
      questionId: '7',
    }),
  ).toBe('https://www.zhihu.com/question/7/answer/19012345678901234567');
});

test.each(['', 'undefined', 'NaN', '0', -1, 1.5, Number.NaN, 1e20])(
  'does not share an invalid content identity %s',
  (id) => {
    expect(
      resolveContentShareUrl('answer', {
        id,
        url: 'https://www.zhihu.com/answer/42',
      }),
    ).toBe('');
  },
);

test.each([
  'https://www.zhihu.com/api/v4/answers/42',
  'https://api.zhihu.com/answers/42',
  'https://daily.zhihu.com/api/4/news/42',
  'https://www.zhihu.com/question/undefined/answer/42',
  'zhihu://answers/42',
  'not a url',
])('replaces unusable explicit URLs with a canonical link (%s)', (url) => {
  expect(resolveContentShareUrl('answer', { id: '42', url })).toBe(
    'https://www.zhihu.com/answer/42',
  );
});

test('honors a public explicit URL without exposing embedded credentials', () => {
  expect(
    resolveContentShareUrl('daily', {
      id: '42',
      url: 'http://daily.zhihu.com/story/42',
    }),
  ).toBe('http://daily.zhihu.com/story/42');
  expect(
    resolveContentShareUrl('answer', {
      id: '42',
      url: 'https://synthetic:synthetic@www.zhihu.com/answer/42',
    }),
  ).toBe('https://www.zhihu.com/answer/42');
});

test('builds readable information and escapes Markdown metadata', () => {
  const data = {
    id: '42',
    title: '标题\n[示例]',
    author: '作者*示例*',
    authorHeadline: '简短\n介绍',
  };
  expect(buildContentShareText('answer', data, 'plain')).toBe(
    '标题 [示例]\n\n作者*示例*（简短 介绍） 的回答\n\nhttps://www.zhihu.com/answer/42',
  );
  expect(buildContentShareText('answer', data, 'markdown')).toBe(
    '### 标题 \\[示例\\]\n\n**作者\\*示例\\***（简短 介绍） 的回答\n\nhttps://www.zhihu.com/answer/42',
  );
});

test('does not invent missing author metadata or generate text for invalid IDs', () => {
  expect(buildContentShareText('question', { id: 42 }, 'plain')).toBe(
    '知乎问题\n\nhttps://www.zhihu.com/question/42',
  );
  expect(buildContentShareText('answer', { id: '' }, 'markdown')).toBe('');
});

test.each(['android', 'web'] as const)(
  '%s shares a link in message so Android does not drop it',
  async (platform) => {
    Platform.OS = platform;
    await shareContent('answer', { id: 42, title: '示例问题' }, 'link');
    expect(share).toHaveBeenCalledWith(
      { message: 'https://www.zhihu.com/answer/42', title: '示例问题' },
      { subject: '示例问题', dialogTitle: '示例问题' },
    );
  },
);

test('iOS shares the URL once and information shares title, author and link once', async () => {
  Platform.OS = 'ios';
  await shareContent('answer', { id: 42, title: '示例问题' }, 'link');
  expect(share).toHaveBeenLastCalledWith(
    { url: 'https://www.zhihu.com/answer/42', title: '示例问题' },
    { subject: '示例问题', dialogTitle: '示例问题' },
  );
  await shareContent(
    'answer',
    { id: 42, title: '示例问题', author: '示例作者' },
    'information',
  );
  const content = share.mock.calls.at(-1)?.[0];
  expect(content).toEqual({
    message: '示例问题\n\n示例作者 的回答\n\nhttps://www.zhihu.com/answer/42',
    title: '示例问题',
  });
  expect(content?.url).toBeUndefined();
});

test('handles native failures and invalid content without rejecting menu callbacks', async () => {
  share.mockRejectedValueOnce(new Error('synthetic sharing failure'));
  await expect(
    shareContent('answer', { id: 42 }, 'link'),
  ).resolves.toBeUndefined();
  expect(showToast).toHaveBeenLastCalledWith('分享失败，请稍后重试');
  share.mockClear();
  await shareContent('answer', { id: '' }, 'link');
  expect(share).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenLastCalledWith('当前内容暂时无法分享');
});

test('treats canceled system sharing as cancellation', async () => {
  share.mockResolvedValueOnce({
    action: Share.dismissedAction,
    activityType: undefined,
  });
  await shareContent('answer', { id: 42 }, 'link');
  share.mockRejectedValueOnce({ name: 'AbortError' });
  await shareContent('answer', { id: 42 }, 'link');
  expect(showToast).not.toHaveBeenCalled();
});
