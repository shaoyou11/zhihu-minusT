import { getPublishingQuestionId } from '../src/utils/publishingQuestion';

test.each([
  'https://www.zhihu.com/question/123?source=invite#answer',
  'https://www.zhihu.com/question/123/',
  'zhihu://questions/123',
  '/question/123?source=invite',
])(
  'resolves invitation links without query or trailing-slash corruption: %s',
  (url) => {
    expect(
      getPublishingQuestionId({
        content: { text: '合成问题', target_link: url },
      }),
    ).toBe('123');
  },
);

test.each([
  undefined,
  'https://example.com/question/123',
  'https://www.zhihu.com/answer/123',
  'https://www.zhihu.com/question/not-an-id',
])(
  'does not open an invalid editor for malformed invitation links: %s',
  (url) => {
    expect(
      getPublishingQuestionId({
        content: { text: '合成问题', target_link: url },
      }),
    ).toBeNull();
  },
);

test('supports the direct and nested question response shapes', () => {
  const question = { id: 123, title: '合成问题', type: 'question' as const };
  for (const item of [
    question,
    { question },
    { target: question },
    { extra: { data: question } },
  ]) {
    expect(getPublishingQuestionId(item)).toBe('123');
  }
  expect(getPublishingQuestionId({})).toBeNull();
});
