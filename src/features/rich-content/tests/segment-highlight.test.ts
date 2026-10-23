import assert from 'node:assert/strict';
import type { ZhihuSegmentHighlightRun } from '../document';
import { parseZhihuSegmentHighlight } from '../segmentHighlight';

test('projects complete highlight attributes into grouped metadata', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'other highlight-wrap has-comments',
      'data-highlight-id': 'one, two',
      'data-highlight-display-text': '  first\n\nsecond  ',
      'data-highlight-source-url': '  https://example.com/article/1  ',
      'data-highlight-is-span': 'true',
      'data-highlight-like-count': '4',
      'data-highlight-comment-count': '2',
      'data-highlight-my-comment-count': '0',
      'data-highlight-is-like': 'false',
      'data-highlight-content-id': '  answer-one  ',
      'data-highlight-content-type': 'answer',
      'data-highlight-pid': '  paragraph-one  ',
      'data-highlight-start-offset': '0',
      'data-highlight-end-offset': '7',
      'data-highlight-id-extra': 'discarded',
      'data-highlight-split-type': 'middle',
      unrelated: { headers: 'discarded' },
    }),
    {
      segmentIds: ['one', 'two'],
      displayText: '  first\n\nsecond  ',
      sourceUrl: 'https://example.com/article/1',
      isSpan: true,
      reaction: {
        likeCount: 4,
        commentCount: 2,
        myCommentCount: 0,
        isLiked: false,
      },
      target: { contentId: 'answer-one', contentType: 'answer' },
      location: { paragraphId: 'paragraph-one', range: { start: 0, end: 7 } },
    },
  );
});

test.each([
  undefined,
  null,
  [],
  ['highlight-wrap'],
  1,
  true,
  'highlight-wrap',
  {},
  { class: ['highlight-wrap'] },
  { class: { value: 'highlight-wrap' } },
  { attributes: { class: 'highlight-wrap' } },
  { class: 'highlight-wrap-extra' },
  { class: 'prefix-highlight-wrap' },
  { class: 'HIGHLIGHT-WRAP' },
  { class: 'other\u00a0highlight-wrap' },
])(
  'rejects non-object inputs and non-matching class tokens %j',
  (attributes) => {
    assert.equal(parseZhihuSegmentHighlight(attributes), null);
  },
);

test('recognizes an exact class token separated by HTML whitespace', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: '\tother\n\fhighlight-wrap\r has-comments ',
    }),
    {},
  );
});

test('retains the visual highlight with empty metadata and formatted children', () => {
  const highlight = parseZhihuSegmentHighlight({ class: 'highlight-wrap' });
  assert.deepEqual(highlight, {});
  assert.ok(highlight);
  const run: ZhihuSegmentHighlightRun = {
    id: 'highlight-one',
    type: 'segmentHighlight',
    highlight,
    children: [
      {
        id: 'strong-one',
        type: 'strong',
        children: [{ id: 'text-one', type: 'text', text: '知识点' }],
      },
    ],
  };
  assert.equal(run.children[0].type, 'strong');
  assert.deepEqual(run.highlight, {});
});

test('trims and deduplicates segment IDs in their original order', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-id': ' two, ,one,two, one ,\nthree, ',
    }),
    { segmentIds: ['two', 'one', 'three'] },
  );
});

test('preserves display whitespace and defers source URL validation', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-display-text': ' \n knowledge point \t ',
      'data-highlight-source-url': '  /article/one  ',
    }),
    { displayText: ' \n knowledge point \t ', sourceUrl: '/article/one' },
  );
});

test('omits blank and wrongly typed attributes without fabricating defaults', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-id': ['one'],
      'data-highlight-display-text': ' \n ',
      'data-highlight-source-url': { url: '/article/one' },
      'data-highlight-is-span': false,
      'data-highlight-is-like': true,
      'data-highlight-like-count': 0,
      'data-highlight-comment-count': null,
      'data-highlight-my-comment-count': [],
      'data-highlight-content-id': {},
      'data-highlight-content-type': ['answer'],
      'data-highlight-pid': [],
      'data-highlight-start-offset': 0,
      'data-highlight-end-offset': 1,
    }),
    {},
  );
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-id': ', \t ,',
      'data-highlight-source-url': '  ',
    }),
    {},
  );
});

test.each([
  ['true', true],
  ['false', false],
  ['1', true],
  ['0', false],
])('accepts only explicit boolean spellings %s', (value, expected) => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-is-span': value,
      'data-highlight-is-like': value,
    }),
    { isSpan: expected, reaction: { isLiked: expected } },
  );
});

test.each(['', 'yes', 'TRUE', 'False', ' true ', '01', '2'])(
  'omits invalid boolean spellings %s',
  (value) => {
    assert.deepEqual(
      parseZhihuSegmentHighlight({
        class: 'highlight-wrap',
        'data-highlight-is-span': value,
        'data-highlight-is-like': value,
      }),
      {},
    );
  },
);

test.each([
  '',
  '-1',
  '+1',
  '1.5',
  '1e2',
  '0x10',
  ' 1 ',
  '1\n',
  '1\r',
  'NaN',
  'Infinity',
  '9007199254740992',
])('omits invalid decimal counts %s', (value) => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-like-count': value,
      'data-highlight-comment-count': value,
      'data-highlight-my-comment-count': value,
    }),
    {},
  );
});

test('accepts zero and safe integer counts without inventing other reaction fields', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-like-count': '00',
      'data-highlight-comment-count': '9007199254740991',
    }),
    { reaction: { likeCount: 0, commentCount: Number.MAX_SAFE_INTEGER } },
  );
});

test.each([
  {},
  { 'data-highlight-content-id': 'one' },
  { 'data-highlight-content-type': 'answer' },
  { 'data-highlight-content-id': ' ', 'data-highlight-content-type': 'answer' },
  {
    'data-highlight-content-id': 'one',
    'data-highlight-content-type': 'question',
  },
  {
    'data-highlight-content-id': 'one',
    'data-highlight-content-type': ' article ',
  },
])('omits an incomplete or unsupported target %j', (fields) => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({ class: 'highlight-wrap', ...fields }),
    {},
  );
});

test('accepts article targets', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-content-id': 'one',
      'data-highlight-content-type': 'article',
    }),
    { target: { contentId: 'one', contentType: 'article' } },
  );
});

test.each([
  { 'data-highlight-pid': undefined },
  { 'data-highlight-pid': ' ' },
  { 'data-highlight-start-offset': undefined },
  { 'data-highlight-end-offset': undefined },
  { 'data-highlight-start-offset': '-1' },
  { 'data-highlight-start-offset': '1.5' },
  { 'data-highlight-end-offset': '9007199254740992' },
  { 'data-highlight-start-offset': '5', 'data-highlight-end-offset': '4' },
  { 'data-highlight-start-offset': '2', 'data-highlight-end-offset': '2' },
])('omits incomplete, unsafe, or reversed locations %j', (fields) => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-pid': 'paragraph-one',
      'data-highlight-start-offset': '0',
      'data-highlight-end-offset': '4',
      ...fields,
    }),
    {},
  );
});

test('keeps half-open UTF-16 offsets independently of cross-paragraph display text', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-display-text': '跨段文本\n\n😀',
      'data-highlight-pid': 'paragraph-one',
      'data-highlight-start-offset': '2',
      'data-highlight-end-offset': '4',
    }),
    {
      displayText: '跨段文本\n\n😀',
      location: { paragraphId: 'paragraph-one', range: { start: 2, end: 4 } },
    },
  );
});

test('omits empty locations while retaining display and visual metadata', () => {
  assert.deepEqual(
    parseZhihuSegmentHighlight({
      class: 'highlight-wrap',
      'data-highlight-display-text': '保留划线文本',
      'data-highlight-is-span': 'true',
      'data-highlight-pid': 'paragraph-one',
      'data-highlight-start-offset': '2',
      'data-highlight-end-offset': '2',
    }),
    { displayText: '保留划线文本', isSpan: true },
  );
});

test('ignores inherited attributes', () => {
  assert.equal(
    parseZhihuSegmentHighlight(Object.create({ class: 'highlight-wrap' })),
    null,
  );
  assert.deepEqual(
    parseZhihuSegmentHighlight(
      Object.assign(Object.create({ 'data-highlight-id': 'inherited' }), {
        class: 'highlight-wrap',
      }),
    ),
    {},
  );
});
