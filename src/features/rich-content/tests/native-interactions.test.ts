import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ZhihuSegmentInfo,
  ZhihuSegmentMark,
  ZhihuSegmentReaction,
} from '@/types/zhihu';
import {
  compileZhihuDocument,
  getRichTextSelectionText,
  mapRichTextSelection,
} from '../compileRichText';
import type { ZhihuNativeSegmentAction } from '../components/ZhihuNativeContent';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
} from '../dev/fixtureDecoder';
import { walkZhihuDocument } from '../documentTraversal';
import {
  getNativeHighlightDisplayText,
  type NativeAnswerSegmentContext,
  resolveNativeAnswerSegment,
} from '../nativeInteractions';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';

const reaction = (
  id: string,
  liked = false,
  likes = 3,
): ZhihuSegmentReaction => ({
  seg_ids: [id],
  is_like: liked,
  like_count: likes,
  comment_count: 2,
});
const paragraphText = '甲乙😀丙丁戊己';
const clickedMark: ZhihuSegmentMark = {
  start_index: 4,
  end_index: 6,
  seg_info: reaction('200'),
};
const paragraph: ZhihuSegmentInfo = {
  pid: 'paragraph-one',
  text: paragraphText,
  marks: [
    { start_index: 0, end_index: 1, seg_info: reaction('100', true, 40) },
    clickedMark,
  ],
};
const action: ZhihuNativeSegmentAction = {
  nodeId: 'render:segment-2',
  paragraphId: paragraph.pid,
  start: 4,
  end: 6,
  text: '丙丁',
  segment: {
    id: 'render:segment-2',
    type: 'segment',
    paragraphId: paragraph.pid,
    range: { start: 4, end: 6 },
    children: [{ id: 'render:text-2', type: 'text', text: '丙丁' }],
  },
};
const context: NativeAnswerSegmentContext = {
  objectId: '42',
  type: 'answer',
  segmentInfos: [paragraph],
};
const withMark = (mark: ZhihuSegmentMark): NativeAnswerSegmentContext => ({
  ...context,
  segmentInfos: [{ ...paragraph, marks: [paragraph.marks[0], mark] }],
});

describe('Native V2 answer segment interaction adapter', () => {
  it('resolves the exact clicked range without borrowing a liked neighboring mark', () => {
    const resolved = resolveNativeAnswerSegment(action, context);
    expect(resolved).toMatchObject({
      pid: paragraph.pid,
      interaction: { is_like: false, like_count: 3, seg_ids: ['200'] },
    });
    expect(resolved?.segment).toBe(paragraph);
    expect(resolved?.interaction.mark).toBe(clickedMark);
  });

  it.each([
    [true, true, '200'],
    [false, true, '300'],
    [false, false, '300'],
  ])(
    'preserves liked/master precedence inside the clicked mark (%s, %s)',
    (segLiked, masterLiked, expectedId) => {
      const mark = {
        ...clickedMark,
        seg_info: reaction('200', segLiked, 4),
        master_seg_info: reaction('300', masterLiked, 9),
      };
      expect(
        resolveNativeAnswerSegment(action, withMark(mark))?.interaction.seg_ids,
      ).toEqual([expectedId]);
    },
  );

  it('retains a valid zero count and string IDs without changing the source metadata', () => {
    const info: ZhihuSegmentReaction = {
      seg_ids: '200',
      is_like: false,
      like_count: 0,
      comment_count: 0,
    };
    const result = resolveNativeAnswerSegment(
      action,
      withMark({ ...clickedMark, seg_info: info }),
    );
    expect(result?.interaction).toMatchObject(info);
    expect(info).toEqual({
      seg_ids: '200',
      is_like: false,
      like_count: 0,
      comment_count: 0,
    });
  });

  it('accepts an API comma-separated ID group without dropping its other IDs', () => {
    const result = resolveNativeAnswerSegment(
      action,
      withMark({
        ...clickedMark,
        seg_info: { ...reaction('200'), seg_ids: '200,300' },
      }),
    );
    expect(result?.interaction.seg_ids).toBe('200,300');
  });

  it.each([true, 1, 'true', '1'])(
    'keeps API metadata flagged as a cross-paragraph thread out of same-paragraph reactions (%j)',
    (isSpan) => {
      const info = { ...reaction('200'), is_span: isSpan };
      expect(
        resolveNativeAnswerSegment(
          action,
          withMark({ ...clickedMark, seg_info: info }),
        ),
      ).toBeNull();
    },
  );

  it('does not borrow another reaction ID when the preferred liked reaction has no ID', () => {
    expect(
      resolveNativeAnswerSegment(
        action,
        withMark({
          ...clickedMark,
          seg_info: { is_like: true, like_count: 4, comment_count: 0 },
          master_seg_info: reaction('300'),
        }),
      ),
    ).toBeNull();
  });

  it.each([undefined, '', ' ', 'prototype-segment', [], [''], ['200', '']])(
    'rejects missing, synthetic or invalid segment IDs %j',
    (ids) => {
      const info = { ...reaction('200'), seg_ids: ids } as ZhihuSegmentReaction;
      expect(
        resolveNativeAnswerSegment(
          action,
          withMark({ ...clickedMark, seg_info: info }),
        ),
      ).toBeNull();
    },
  );

  it.each(['article', 'pin', 'question'] as const)(
    'keeps %s out of the answer-only API path',
    (type) => {
      expect(
        resolveNativeAnswerSegment(action, { ...context, type }),
      ).toBeNull();
    },
  );

  it.each(['', 'prototype-answer', '0'])(
    'rejects missing or synthetic answer targets %j',
    (objectId) => {
      expect(
        resolveNativeAnswerSegment(action, { ...context, objectId }),
      ).toBeNull();
    },
  );

  it('rejects an absent exact mark, ambiguous paragraphs and duplicate exact ranges', () => {
    expect(
      resolveNativeAnswerSegment(action, {
        ...context,
        segmentInfos: [{ ...paragraph, marks: [paragraph.marks[0]] }],
      }),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(action, {
        ...context,
        segmentInfos: [paragraph, paragraph],
      }),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(action, {
        ...context,
        segmentInfos: [{ ...paragraph, marks: [clickedMark, clickedMark] }],
      }),
    ).toBeNull();
  });

  it('rejects stale source text and attachment copy text that differs from the API slice', () => {
    expect(
      resolveNativeAnswerSegment({ ...action, text: '旧文字' }, context),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment({ ...action, text: '丙x丁' }, context),
    ).toBeNull();
  });

  it('rejects an unbound run, a different paragraph and an event range different from its run', () => {
    expect(
      resolveNativeAnswerSegment({ ...action, segment: undefined }, context),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment({ ...action, nodeId: 'other' }, context),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment({ ...action, paragraphId: 'other' }, context),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment({ ...action, start: 3 }, context),
    ).toBeNull();
  });

  it('rejects bisected UTF-16 surrogate pairs even if an API mark has that range', () => {
    const badAction: ZhihuNativeSegmentAction = {
      ...action,
      start: 3,
      end: 4,
      text: paragraphText.slice(3, 4),
      segment: {
        id: action.nodeId,
        type: 'segment',
        paragraphId: paragraph.pid,
        range: { start: 3, end: 4 },
        children: [],
      },
    };
    expect(
      resolveNativeAnswerSegment(
        badAction,
        withMark({ start_index: 3, end_index: 4, seg_info: reaction('200') }),
      ),
    ).toBeNull();
  });

  it('keeps incomplete HTML highlights without verified source out of the business adapter', () => {
    const highlightedAction: ZhihuNativeSegmentAction = {
      ...action,
      segment: {
        id: action.nodeId,
        type: 'segmentHighlight',
        children: [],
        highlight: {
          target: { contentType: 'answer', contentId: context.objectId },
          segmentIds: ['200'],
          location: { paragraphId: paragraph.pid, range: { start: 4, end: 6 } },
        },
      },
    };
    expect(resolveNativeAnswerSegment(highlightedAction, context)).toBeNull();
  });

  it('rejects malformed reaction statistics rather than coercing them into an API target', () => {
    expect(
      resolveNativeAnswerSegment(
        action,
        withMark({
          ...clickedMark,
          seg_info: { ...reaction('200'), like_count: Number.NaN },
        }),
      ),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(
        action,
        withMark({
          ...clickedMark,
          seg_info: { ...reaction('200'), comment_count: -1 },
        }),
      ),
    ).toBeNull();
  });
});

// Attribute names mirror the sanitized highlight parser examples. None of the
// stored answer fixtures currently contains highlight-wrap business metadata.
function htmlHighlight(changes: Record<string, string | undefined> = {}) {
  const attributes = {
    id: '200,300',
    'content-id': '42',
    'content-type': 'answer',
    pid: 'paragraph-one',
    'start-offset': '1',
    'end-offset': '4',
    'is-span': 'false',
    'is-like': 'false',
    'like-count': '0',
    'comment-count': '2',
    ...changes,
  };
  const attributeText = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `data-highlight-${key}="${value}"`)
    .join(' ');
  const document = normalizeZhihuDocument(
    `<p data-pid="paragraph-one">甲<span class="highlight-wrap" ${attributeText}><strong>乙😀</strong></span>丙</p>`,
    { documentId: 'answer:42' },
  ).document;
  const run = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'segmentHighlight',
  );
  if (run?.type !== 'segmentHighlight')
    throw new Error('Missing test highlight');
  const highlightedAction: ZhihuNativeSegmentAction = {
    nodeId: run.id,
    paragraphId: 'paragraph-one',
    start: 1,
    end: 4,
    text: '乙😀',
    segment: run,
  };
  return {
    document,
    action: highlightedAction,
    context: { objectId: '42', type: 'answer', document } as const,
  };
}

describe('Native V2 structured HTML highlight interaction adapter', () => {
  it('restores API reaction actions when iOS hits a nested visual HTML highlight first', () => {
    const segment: ZhihuSegmentInfo = {
      pid: 'paragraph-one',
      text: '甲乙😀丙',
      marks: [
        { start_index: 1, end_index: 4, seg_info: reaction('200', true, 8) },
      ],
    };
    const document = normalizeZhihuDocument(
      '<p data-pid="paragraph-one">甲<span class="highlight-wrap"><strong>乙😀</strong></span>丙</p>',
      { documentId: 'answer:42', segmentInfos: [segment] },
    ).document;
    const part = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts.find((item) => item.type === 'flow');
    if (part?.type !== 'flow') throw new Error('Missing highlighted flow');
    const runs = [...walkZhihuDocument(document)];
    // iOS selects the first hit decoration; Android checks them in reverse.
    expect(part.flow.decorations).toHaveLength(2);
    for (const decoration of part.flow.decorations) {
      const run = runs.find((node) => node.id === decoration.actionId);
      if (run?.type !== 'segment' && run?.type !== 'segmentHighlight')
        throw new Error('Missing highlighted source');
      const mapping = mapRichTextSelection(
        part.flow,
        decoration.start,
        decoration.end,
      );
      if (!mapping) throw new Error('Missing highlighted source mapping');
      const result = resolveNativeAnswerSegment(
        {
          nodeId: run.id,
          paragraphId: mapping.start.paragraphId,
          start: mapping.start.offset,
          end: mapping.end.offset,
          text: getRichTextSelectionText(
            part.flow,
            decoration.start,
            decoration.end,
          ),
          segment: run,
        },
        { objectId: '42', type: 'answer', document, segmentInfos: [segment] },
      );
      expect(result?.segment).toBe(segment);
      expect(result?.interaction).toMatchObject({
        seg_ids: ['200'],
        is_like: true,
        like_count: 8,
        comment_count: 2,
      });
    }
  });

  it('uses current API IDs and statistics instead of stale HTML reaction metadata', () => {
    const sample = htmlHighlight({ id: '999', 'like-count': '1' });
    const segment: ZhihuSegmentInfo = {
      pid: 'paragraph-one',
      text: '甲乙😀丙',
      marks: [
        { start_index: 1, end_index: 4, seg_info: reaction('200', true, 8) },
      ],
    };
    expect(
      resolveNativeAnswerSegment(sample.action, {
        ...sample.context,
        segmentInfos: [segment],
      })?.interaction,
    ).toMatchObject({ seg_ids: ['200'], is_like: true, like_count: 8 });
  });

  it.each([
    { 'content-id': '43' },
    { 'content-type': 'article' },
    { 'is-span': 'true' },
    { 'start-offset': '0', 'end-offset': '3' },
  ])(
    'does not use an API mark to override conflicting HTML source metadata (%j)',
    (attributes) => {
      const sample = htmlHighlight(attributes);
      expect(
        resolveNativeAnswerSegment(sample.action, {
          ...sample.context,
          segmentInfos: [
            {
              pid: 'paragraph-one',
              text: '甲乙😀丙',
              marks: [
                { start_index: 1, end_index: 4, seg_info: reaction('200') },
              ],
            },
          ],
        }),
      ).toBeNull();
    },
  );

  it('does not borrow a neighboring mark or bypass invalid current API reaction metadata', () => {
    const sample = htmlHighlight({
      'content-id': undefined,
      'content-type': undefined,
    });
    for (const marks of [
      [{ start_index: 0, end_index: 1, seg_info: reaction('200', true) }],
      [
        {
          start_index: 1,
          end_index: 4,
          seg_info: { ...reaction('200'), is_span: true },
        },
      ],
      [
        {
          start_index: 1,
          end_index: 4,
          seg_info: { ...reaction('200'), seg_ids: [] },
        },
      ],
      [
        { start_index: 1, end_index: 4, seg_info: reaction('200') },
        { start_index: 1, end_index: 4, seg_info: reaction('300') },
      ],
    ]) {
      expect(
        resolveNativeAnswerSegment(sample.action, {
          ...sample.context,
          segmentInfos: [{ pid: 'paragraph-one', text: '甲乙😀丙', marks }],
        }),
      ).toBeNull();
    }
  });

  it('projects complete single-paragraph metadata onto the existing menu shape', () => {
    const sample = htmlHighlight();
    const result = resolveNativeAnswerSegment(sample.action, sample.context);
    expect(result).toEqual({
      pid: 'paragraph-one',
      segment: {
        pid: 'paragraph-one',
        text: '甲乙😀丙',
        marks: [
          {
            start_index: 1,
            end_index: 4,
            seg_info: {
              seg_ids: ['200', '300'],
              is_like: false,
              like_count: 0,
              comment_count: 2,
            },
          },
        ],
      },
      interaction: {
        seg_ids: ['200', '300'],
        is_like: false,
        like_count: 0,
        comment_count: 2,
        mark: {
          start_index: 1,
          end_index: 4,
          seg_info: {
            seg_ids: ['200', '300'],
            is_like: false,
            like_count: 0,
            comment_count: 2,
          },
        },
      },
    });
  });

  it.each([
    { id: undefined },
    { id: 'prototype-id' },
    { 'content-id': '43' },
    { 'content-type': 'article' },
    { pid: 'other-paragraph' },
    { 'start-offset': '0', 'end-offset': '3' },
    { 'like-count': undefined },
    { 'comment-count': '-1' },
    { 'is-like': undefined },
    { 'is-span': 'true', 'display-text': '乙😀\n其他段落' },
  ])('preserves partial/unsafe highlights as local-only (%j)', (attributes) => {
    const sample = htmlHighlight(attributes);
    expect(
      resolveNativeAnswerSegment(sample.action, sample.context),
    ).toBeNull();
  });

  it('checks the current document and optional API paragraph source', () => {
    const sample = htmlHighlight();
    expect(
      resolveNativeAnswerSegment(sample.action, {
        ...sample.context,
        document: { ...sample.document, blocks: [] },
      }),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(sample.action, {
        ...sample.context,
        segmentInfos: [{ pid: 'paragraph-one', text: '旧文字', marks: [] }],
      }),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(
        { ...sample.action, text: '不匹配' },
        sample.context,
      ),
    ).toBeNull();
    expect(
      resolveNativeAnswerSegment(sample.action, {
        ...sample.context,
        document: {
          ...sample.document,
          blocks: [...sample.document.blocks, ...sample.document.blocks],
        },
      }),
    ).toBeNull();
  });

  it('shares one explicit cross-paragraph display text across the full thread ID set', () => {
    const sample = htmlHighlight({
      'is-span': 'true',
      'display-text': '完整跨段片段',
    });
    const other = htmlHighlight({ 'is-span': 'true', id: '300,200' });
    const run = other.action.segment;
    if (run?.type !== 'segmentHighlight')
      throw new Error('Missing test highlight');
    const second = { ...run, id: 'second-highlight' };
    const document = {
      ...sample.document,
      blocks: [
        ...sample.document.blocks,
        {
          id: 'second-paragraph',
          type: 'paragraph' as const,
          children: [second],
        },
      ],
    };
    expect(
      getNativeHighlightDisplayText(
        { ...other.action, nodeId: second.id, segment: second },
        document,
      ),
    ).toBe('完整跨段片段');
    expect(
      resolveNativeAnswerSegment(sample.action, {
        ...sample.context,
        document,
      }),
    ).toBeNull();
  });

  it('does not borrow a copy label from another target, a partial ID group or conflicting labels', () => {
    const sample = htmlHighlight({ 'is-span': 'true' });
    const variants = [
      { 'content-id': '43' },
      { id: '200' },
      { 'content-type': 'article' },
    ];
    for (const attributes of variants) {
      const other = htmlHighlight({
        ...attributes,
        'display-text': '其他来源完整片段',
      });
      const run = other.action.segment;
      if (run?.type !== 'segmentHighlight')
        throw new Error('Missing test highlight');
      const document = {
        ...sample.document,
        blocks: [
          ...sample.document.blocks,
          {
            id: 'different-paragraph',
            type: 'paragraph' as const,
            children: [{ ...run, id: 'different-highlight' }],
          },
        ],
      };
      expect(getNativeHighlightDisplayText(sample.action, document)).toBe(
        sample.action.text,
      );
    }
    const first = htmlHighlight({ 'display-text': '版本一' }).action.segment;
    const second = htmlHighlight({ 'display-text': '版本二' }).action.segment;
    if (!first || !second) throw new Error('Missing test highlights');
    expect(
      getNativeHighlightDisplayText(sample.action, {
        ...sample.document,
        blocks: [
          ...sample.document.blocks,
          {
            id: 'conflicting-labels',
            type: 'paragraph',
            children: [
              { ...first, id: 'label-one' },
              { ...second, id: 'label-two' },
            ],
          },
        ],
      }),
    ).toBe(sample.action.text);
  });
});

describe('stored sanitized answer metadata through Native interaction adapter', () => {
  it.each([
    ['pig', 35, true],
    ['question-feed-card-heavy', 19, true],
    ['question-feed-card-formula-table-001', 1, false],
  ] as const)(
    'checks exact marks and rejects synthetic object targets (%s)',
    (name, expectedCount, expectedBusinessTarget) => {
      const manifest = parseRichContentFixtureManifest(
        JSON.parse(
          readFileSync(
            path.join(__dirname, '../fixtures/manifest.json'),
            'utf8',
          ),
        ),
      );
      const summary = manifest.find(
        (item) => item.file === `./cases/${name}.json`,
      );
      if (!summary) throw new Error('Missing registered test fixture');
      const fixture: unknown = JSON.parse(
        readFileSync(
          path.join(__dirname, '../fixtures/cases', `${name}.json`),
          'utf8',
        ),
      );
      const source = decodeRichContentDevFixture(summary, fixture);
      const document = normalizeZhihuDocument(source.content, {
        documentId: `fixture:${name}`,
        segmentInfos: source.segmentInfos,
      }).document;
      const runs = [...walkZhihuDocument(document)].filter(
        (node) => node.type === 'segment',
      );
      const compilation = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 25.5,
      });
      expect(runs).toHaveLength(expectedCount);
      for (const run of runs) {
        const part = compilation.parts.find(
          (item) =>
            item.type === 'flow' &&
            item.flow.decorations.some(
              (decoration) => decoration.actionId === run.id,
            ),
        );
        if (part?.type !== 'flow')
          throw new Error('Missing fixture marked flow');
        const decoration = part.flow.decorations.find(
          (item) => item.actionId === run.id,
        );
        if (!decoration) throw new Error('Missing fixture decoration');
        const mapping = mapRichTextSelection(
          part.flow,
          decoration.start,
          decoration.end,
        );
        if (!mapping) throw new Error('Missing fixture source mapping');
        const resolved = resolveNativeAnswerSegment(
          {
            nodeId: run.id,
            paragraphId: mapping.start.paragraphId,
            start: mapping.start.offset,
            end: mapping.end.offset,
            text: getRichTextSelectionText(
              part.flow,
              decoration.start,
              decoration.end,
            ),
            segment: run,
          },
          {
            objectId: source.objectId,
            type: source.rendererType,
            document,
            segmentInfos: source.segmentInfos,
          },
        );
        // Avoid snapshotting body text or unrelated user metadata from fixtures.
        expect(Boolean(resolved)).toBe(expectedBusinessTarget);
        if (resolved)
          expect(
            resolved.interaction.mark.start_index === run.range.start &&
              resolved.interaction.mark.end_index === run.range.end,
          ).toBe(true);
      }
    },
  );
});
