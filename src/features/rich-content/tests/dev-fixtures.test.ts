import assert from 'node:assert/strict';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
  type RichContentFixtureSummary,
} from '../dev/fixtureDecoder';

function summary(
  overrides: Partial<RichContentFixtureSummary> = {},
): RichContentFixtureSummary {
  return {
    id: 'synthetic-case',
    file: './cases/synthetic-case.json',
    sourceType: 'answer',
    contentPath: 'content',
    traits: [],
    expected: {},
    ...overrides,
  };
}

function segment(overrides: Record<string, unknown> = {}) {
  return {
    pid: 'paragraph-one',
    text: 'A😀B',
    marks: [
      {
        start_index: 0,
        end_index: 4,
        seg_info: {
          like_count: 1,
          comment_count: 0,
          is_like: false,
          seg_ids: 'segment-one',
        },
      },
    ],
    ...overrides,
  };
}

const content = '<p data-pid="paragraph-one">A😀B</p>';

test('decodes a wrapped daily body as an article with the daily image variant', () => {
  const body =
    '<div class="meta"><img class="avatar" src="https://example.com/avatar.png"></div><p>示例正文</p>';
  const fixture = decodeRichContentDevFixture(
    summary({ sourceType: 'daily', contentPath: 'body' }),
    { default: { id: 42, type: 'daily', title: '示例日报', body } },
  );

  assert.equal(fixture.content, body);
  assert.equal(fixture.rendererType, 'article');
  assert.equal(fixture.variant, 'daily');
  assert.equal(fixture.objectId, '42');
  assert.equal(fixture.title, '示例日报');
  assert.equal(fixture.contentArray, undefined);
  assert.equal(fixture.segmentInfos, undefined);
});

test('preserves string segment IDs in both reaction fields and UTF-16 ranges', () => {
  const segmentInfo = segment();
  const mark = segmentInfo.marks[0];
  const masterReaction = { ...mark.seg_info, seg_ids: 'master-one,master-two' };
  const fixture = decodeRichContentDevFixture(
    summary({
      sourceType: 'question_feed_card',
      contentPath: 'target.content',
    }),
    {
      target: {
        id: 'answer-42',
        content,
        question: { title: '示例问题' },
        segment_infos: [
          {
            ...segmentInfo,
            marks: [{ ...mark, master_seg_info: masterReaction }],
          },
        ],
      },
    },
  );

  assert.equal(fixture.rendererType, 'answer');
  assert.equal(fixture.variant, 'default');
  assert.equal(fixture.objectId, 'answer-42');
  assert.equal(fixture.title, '示例问题');
  assert.equal(fixture.segmentInfos?.[0].marks[0].end_index, 4);
  assert.equal(
    fixture.segmentInfos?.[0].marks[0].seg_info?.seg_ids,
    'segment-one',
  );
  assert.equal(
    fixture.segmentInfos?.[0].marks[0].master_seg_info?.seg_ids,
    'master-one,master-two',
  );
});

test.each([
  { segIds: undefined },
  { segIds: [] },
  { segIds: ['segment-one', 'segment-two'] },
])(
  'retains the existing array or omitted segment ID form $segIds',
  ({ segIds }) => {
    const segmentInfo = segment();
    const mark = segmentInfo.marks[0];
    const fixture = decodeRichContentDevFixture(summary(), {
      type: 'answer',
      content,
      segment_infos: [
        {
          ...segmentInfo,
          marks: [{ ...mark, seg_info: { ...mark.seg_info, seg_ids: segIds } }],
        },
      ],
    });
    assert.deepEqual(
      fixture.segmentInfos?.[0].marks[0].seg_info?.seg_ids,
      segIds,
    );
  },
);

test.each([
  { segIds: '' },
  { segIds: 12 },
  { segIds: [''] },
  { segIds: ['segment-one', 12] },
  { segIds: {} },
  { segIds: null },
])('rejects malformed segment IDs $segIds', ({ segIds }) => {
  const segmentInfo = segment();
  const mark = segmentInfo.marks[0];
  assert.throws(
    () =>
      decodeRichContentDevFixture(summary(), {
        type: 'answer',
        content,
        segment_infos: [
          {
            ...segmentInfo,
            marks: [
              { ...mark, seg_info: { ...mark.seg_info, seg_ids: segIds } },
            ],
          },
        ],
      }),
    /fixture segment_infos contains an invalid segment/,
  );
});

test('projects Pin fields while omitting invalid records and invalid optional types', () => {
  const invalidFields = Object.freeze({
    type: 12,
    content: false,
    url: ['https://example.com'],
    data_draft_title: {},
    data_draft_cover: null,
    extra: 'ignored',
  });
  const fixture = decodeRichContentDevFixture(
    summary({ sourceType: 'pin', contentPath: 'content.0.content' }),
    {
      type: 'pin',
      id: 'pin-42',
      content: [
        { type: 'text', content: '<p>示例想法</p>', extra: 'ignored' },
        null,
        42,
        'text is not a record',
        [],
        invalidFields,
        { type: '' },
        { type: '  ' },
        {
          type: 'custom-content-type',
          content: false,
          url: 12,
          data_draft_title: [],
          data_draft_cover: {},
        },
        {
          type: 'link',
          content: '<p>示例卡片</p>',
          url: 'https://example.com/card',
          data_draft_title: '示例标题',
          data_draft_cover: 'https://example.com/cover.png',
          extra: 'ignored',
        },
      ],
    },
  );

  assert.equal(fixture.rendererType, 'pin');
  assert.deepEqual(fixture.contentArray, [
    { type: 'text', content: '<p>示例想法</p>' },
    { type: 'custom-content-type' },
    {
      type: 'link',
      content: '<p>示例卡片</p>',
      url: 'https://example.com/card',
      data_draft_title: '示例标题',
      data_draft_cover: 'https://example.com/cover.png',
    },
  ]);
});

test.each([
  {
    name: 'range past the UTF-16 text length',
    segments: [
      segment({
        marks: [{ ...segment().marks[0], end_index: 5 }],
      }),
    ],
    error: /invalid segment/,
  },
  {
    name: 'a segment without an interaction',
    segments: [segment({ marks: [{ start_index: 0, end_index: 4 }] })],
    error: /invalid segment/,
  },
  {
    name: 'a duplicate paragraph ID',
    segments: [segment(), segment()],
    error: /duplicate pid/,
  },
  {
    name: 'a paragraph absent from the HTML',
    segments: [segment({ pid: 'missing-paragraph' })],
    error: /pid is absent from content/,
  },
])('preserves segment validation for $name', ({ segments, error }) => {
  assert.throws(
    () =>
      decodeRichContentDevFixture(summary(), {
        type: 'answer',
        content,
        segment_infos: segments,
      }),
    error,
  );
});

test('keeps daily contentPath validation and missing object ID fallback', () => {
  const dailySummary = summary({ sourceType: 'daily', contentPath: 'body' });
  assert.throws(
    () => decodeRichContentDevFixture(dailySummary, { body: 42 }),
    /contentPath must resolve to a string/,
  );
  assert.equal(
    decodeRichContentDevFixture(dailySummary, { body: '' }).objectId,
    'fixture-synthetic-case',
  );
});

test('retains manifest shape validation and rejects duplicate IDs', () => {
  assert.deepEqual(parseRichContentFixtureManifest({ cases: [summary()] }), [
    summary({ collectedAt: undefined }),
  ]);
  assert.throws(
    () => parseRichContentFixtureManifest({ cases: [summary(), summary()] }),
    /duplicate rich-content fixture id/,
  );
  assert.throws(
    () =>
      parseRichContentFixtureManifest({
        cases: [{ ...summary(), traits: ['valid', 42] }],
      }),
    /traits must be a string array/,
  );
  assert.throws(
    () =>
      parseRichContentFixtureManifest({
        cases: [{ ...summary(), expected: { activeImages: '1' } }],
      }),
    /expected.activeImages must be a number/,
  );
});
