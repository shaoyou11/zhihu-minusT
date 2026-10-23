import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import type { ZhihuNativeContentSelection } from '../components/ZhihuNativeContent';
import type { ZhihuDocument } from '../document';
import {
  type NativeAnswerSelectionContext,
  resolveNativeAnswerSelection,
} from '../nativeInteractions';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import type { RichTextFlow } from '../richText';

function sample(html: string) {
  const document = normalizeZhihuDocument(html, {
    documentId: 'answer:42',
  }).document;
  return fromDocument(document);
}

function fromDocument(document: ZhihuDocument) {
  const part = compileZhihuDocument(document, {
    fontSize: 17,
    lineHeight: 25.5,
  }).parts.find((item) => item.type === 'flow');
  if (part?.type !== 'flow') throw new Error('Missing test flow');
  return {
    document,
    flow: part.flow,
    context: { objectId: '42', type: 'answer', document } as const,
  };
}

function selection(
  flow: RichTextFlow,
  start = 0,
  end = flow.text.length,
): ZhihuNativeContentSelection {
  return {
    flowId: flow.id,
    textVersion: flow.textVersion,
    start,
    end,
    mapping: mapRichTextSelection(flow, start, end),
  };
}

describe('Native V2 source-text answer selection adapter', () => {
  it('maps styled/link/inline-code text using real UTF-16 paragraph offsets', () => {
    const data = sample(
      '<p data-pid="p-one">甲<strong>乙😀</strong><a href="https://example.com">丙</a><code>丁  戊</code>己</p>',
    );
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow, 1, 8),
        data.flow,
        data.context,
      ),
    ).toEqual({
      text: '乙😀丙丁  ',
      startParagraphId: 'p-one',
      endParagraphId: 'p-one',
      startOffset: 1,
      endOffset: 8,
    });
  });

  it('keeps adjacent body and quote paragraphs with generated newline separators', () => {
    const data = sample(
      '<p data-pid="p-one">甲乙😀</p><blockquote><p data-pid="p-two">丙<strong>丁</strong></p></blockquote><p data-pid="p-three">戊己</p>',
    );
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow, 1, data.flow.text.length - 1),
        data.flow,
        data.context,
      ),
    ).toEqual({
      text: '乙😀\n丙丁\n戊',
      startParagraphId: 'p-one',
      endParagraphId: 'p-three',
      startOffset: 1,
      endOffset: 1,
    });
  });

  it('checks API source text when available without requiring existing knowledge marks', () => {
    const data = sample('<p data-pid="p-one">甲乙😀丙</p>');
    const info: ZhihuSegmentInfo = {
      pid: 'p-one',
      text: '甲乙😀丙',
      marks: [],
    };
    expect(
      resolveNativeAnswerSelection(selection(data.flow), data.flow, {
        ...data.context,
        segmentInfos: [info],
      }),
    ).not.toBeNull();
    expect(
      resolveNativeAnswerSelection(selection(data.flow), data.flow, {
        ...data.context,
        segmentInfos: [{ ...info, text: '甲乙丙' }],
      }),
    ).toBeNull();
    expect(
      resolveNativeAnswerSelection(selection(data.flow), data.flow, {
        ...data.context,
        segmentInfos: [info, info],
      }),
    ).toBeNull();
  });

  it('rejects stale flow identity, altered mapping, clear events and split surrogate pairs', () => {
    const data = sample('<p data-pid="p-one">甲乙😀丙</p>');
    const event = selection(data.flow);
    if (!event.mapping) throw new Error('Missing test mapping');
    const invalid = [
      { ...event, flowId: 'previous-flow' },
      { ...event, textVersion: 'previous-version' },
      { ...event, start: -1, end: -1, mapping: null },
      { ...event, mapping: { ...event.mapping, text: '旧文字' } },
      {
        ...event,
        mapping: {
          ...event.mapping,
          start: { ...event.mapping.start, offset: 1 },
        },
      },
      selection(data.flow, 3, 4),
    ];
    for (const value of invalid)
      expect(
        resolveNativeAnswerSelection(value, data.flow, data.context),
      ).toBeNull();
  });

  it.each([
    '<p>没有业务段落ID</p>',
    '<h2 data-pid="p-one">标题</h2>',
    '<ul><li><p data-pid="p-one">列表段落</p></li></ul>',
    '<p data-pid="p-one">甲<br>乙</p>',
    '<p data-pid="p-one">甲<img src="https://example.com/icon.png" width="16" height="16" alt="图">乙</p>',
    '<p data-pid="p-one">甲<img eeimg="1" src="https://www.zhihu.com/equation?tex=x" alt="x">乙</p>',
    '<p data-pid="p-one">甲<a class="footnote-ref" data-numero="1">[1]</a>乙</p>',
    '<p data-pid="p-one">甲</p><p data-pid="p-one">乙</p>',
  ])(
    'keeps ambiguous or non-plain source structures out of answer mutations (%s)',
    (html) => {
      const data = sample(html);
      expect(
        resolveNativeAnswerSelection(
          selection(data.flow),
          data.flow,
          data.context,
        ),
      ).toBeNull();
    },
  );

  it('rejects semantic fallback nodes even when they supply copyable text', () => {
    const data = fromDocument({
      id: 'answer:42',
      blocks: [
        {
          id: 'paragraph',
          type: 'paragraph',
          paragraphId: 'p-one',
          children: [
            {
              id: 'unsupported-inline',
              type: 'unsupported',
              sourceType: 'unknown-inline',
              fallbackText: '甲乙',
            },
          ],
        },
      ],
    });
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow),
        data.flow,
        data.context,
      ),
    ).toBeNull();
  });

  it('rejects selected attachments even when their copy text resembles source text', () => {
    const data = sample('<p data-pid="p-one">甲乙</p>');
    const alteredFlow: RichTextFlow = {
      ...data.flow,
      attachments: [
        {
          id: 'fabricated-attachment',
          nodeId: 'fabricated-attachment',
          start: 1,
          end: 2,
          kind: 'image',
          copyText: '乙',
        },
      ],
    };
    expect(
      resolveNativeAnswerSelection(
        selection(alteredFlow),
        alteredFlow,
        data.context,
      ),
    ).toBeNull();
  });

  it('rejects source-map gaps, overlap, wrong offsets and incorrect leaf identity', () => {
    const data = sample('<p data-pid="p-one">甲<strong>乙</strong>丙</p>');
    const [first, second, third] = data.flow.sourceMap;
    const invalidMaps = [
      [first, third],
      [first, second, second, third],
      [first, { ...second, sourceStart: 0 }, third],
      [first, { ...second, nodeId: 'different-node' }, third],
      [first, { ...second, paragraphId: 'different-pid' }, third],
    ];
    for (const sourceMap of invalidMaps) {
      const alteredFlow = { ...data.flow, sourceMap };
      expect(
        resolveNativeAnswerSelection(
          selection(alteredFlow),
          alteredFlow,
          data.context,
        ),
      ).toBeNull();
    }
  });

  it('requires source-document neighbors rather than skipping a block or reversing paragraph order', () => {
    const data = sample(
      '<p data-pid="p-one">甲乙</p><p data-pid="p-two">丙丁</p>',
    );
    const [one, two] = data.document.blocks;
    const interrupted: NativeAnswerSelectionContext = {
      ...data.context,
      document: {
        ...data.document,
        blocks: [one, { id: 'media-barrier', type: 'divider' }, two],
      },
    };
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow),
        data.flow,
        interrupted,
      ),
    ).toBeNull();
    expect(
      resolveNativeAnswerSelection(selection(data.flow), data.flow, {
        ...data.context,
        document: { ...data.document, blocks: [two, one] },
      }),
    ).toBeNull();
  });

  it('rejects extra/generated separators and selections whose endpoint lies on a separator', () => {
    const data = sample(
      '<p data-pid="p-one">甲乙</p><p data-pid="p-two">丙丁</p>',
    );
    const sourceMap = data.flow.sourceMap.map((range) =>
      range.kind === 'synthetic' ? { ...range, sourceStart: 0 } : range,
    );
    const malformed = { ...data.flow, sourceMap };
    expect(
      resolveNativeAnswerSelection(
        selection(malformed),
        malformed,
        data.context,
      ),
    ).toBeNull();
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow, 2),
        data.flow,
        data.context,
      ),
    ).toBeNull();
    expect(
      resolveNativeAnswerSelection(
        selection(data.flow, 0, 3),
        data.flow,
        data.context,
      ),
    ).toBeNull();
  });

  it.each([
    { type: 'article', objectId: '42' },
    { type: 'answer', objectId: 'prototype-answer' },
  ] as const)('does not guess unsupported API targets (%j)', (target) => {
    const data = sample('<p data-pid="p-one">甲乙</p>');
    expect(
      resolveNativeAnswerSelection(selection(data.flow), data.flow, {
        ...data.context,
        ...target,
      }),
    ).toBeNull();
  });
});
