import assert from 'node:assert/strict';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuImageResource,
  ZhihuInlineRun,
  ZhihuParagraphBlock,
  ZhihuTableCell,
  ZhihuTextRun,
} from '../document';
import {
  getZhihuDocumentPreviewImages,
  walkZhihuDocument,
} from '../documentTraversal';

function text(id: string): ZhihuTextRun {
  return { id, type: 'text', text: id };
}

function paragraph(
  id: string,
  children: readonly ZhihuInlineRun[] = [text(`${id}-text`)],
): ZhihuParagraphBlock {
  return { id, type: 'paragraph', children };
}

function cell(id: string): ZhihuTableCell {
  return { id, isHeader: false, blocks: [paragraph(`${id}-paragraph`)] };
}

function resource(url: string): ZhihuImageResource {
  return { mediaType: 'image', url };
}

test('walks nested blocks, captions, table sections and footnotes in source order', () => {
  const document: ZhihuDocument = {
    id: 'document',
    blocks: [
      paragraph('opening'),
      {
        id: 'list',
        type: 'list',
        ordered: true,
        items: [
          {
            id: 'item-one',
            blocks: [
              {
                id: 'quote',
                type: 'quote',
                blocks: [
                  {
                    id: 'table',
                    type: 'table',
                    caption: [
                      {
                        id: 'table-caption-link',
                        type: 'link',
                        url: 'https://example.com',
                        children: [text('table-caption-text')],
                      },
                    ],
                    head: [{ id: 'head-row', cells: [cell('head-cell')] }],
                    body: [
                      {
                        id: 'body-row-one',
                        cells: [cell('body-cell-one'), cell('body-cell-two')],
                      },
                      { id: 'body-row-two', cells: [cell('body-cell-three')] },
                    ],
                    foot: [{ id: 'foot-row', cells: [cell('foot-cell')] }],
                  },
                  {
                    id: 'figure',
                    type: 'image',
                    resource: resource('https://example.com/figure.png'),
                    caption: [
                      {
                        id: 'figure-caption-strong',
                        type: 'strong',
                        children: [text('figure-caption-text')],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'nested-list',
                type: 'list',
                ordered: false,
                items: [{ id: 'nested-item', blocks: [paragraph('nested')] }],
              },
            ],
          },
          { id: 'item-two', blocks: [paragraph('second-item')] },
        ],
      },
      paragraph('closing'),
    ],
    footnotes: [
      { id: 'definition-one', label: '1', blocks: [paragraph('footnote-one')] },
      { id: 'definition-two', label: '2', blocks: [paragraph('footnote-two')] },
    ],
  };

  assert.deepEqual(
    [...walkZhihuDocument(document)].map((node) => node.id),
    [
      'opening',
      'opening-text',
      'list',
      'quote',
      'table',
      'table-caption-link',
      'table-caption-text',
      'head-cell-paragraph',
      'head-cell-paragraph-text',
      'body-cell-one-paragraph',
      'body-cell-one-paragraph-text',
      'body-cell-two-paragraph',
      'body-cell-two-paragraph-text',
      'body-cell-three-paragraph',
      'body-cell-three-paragraph-text',
      'foot-cell-paragraph',
      'foot-cell-paragraph-text',
      'figure',
      'figure-caption-strong',
      'figure-caption-text',
      'nested-list',
      'nested',
      'nested-text',
      'second-item',
      'second-item-text',
      'closing',
      'closing-text',
      'footnote-one',
      'footnote-one-text',
      'footnote-two',
      'footnote-two-text',
    ],
  );
});

test('visits every nested inline format and preserves leaf nodes', () => {
  const formats = [
    'strong',
    'emphasis',
    'strikethrough',
    'underline',
    'highlight',
    'subscript',
    'superscript',
    'segmentHighlight',
  ] as const;
  let formatted: ZhihuInlineRun = text('formatted-text');
  for (let index = formats.length - 1; index >= 0; index -= 1) {
    const type = formats[index];
    formatted = { id: type, type, children: [formatted] };
  }
  const document: ZhihuDocument = {
    id: 'document',
    blocks: [
      {
        id: 'heading',
        type: 'heading',
        level: 2,
        children: [
          formatted,
          {
            id: 'link',
            type: 'link',
            url: 'https://example.com',
            children: [
              {
                id: 'segment',
                type: 'segment',
                paragraphId: 'source-paragraph',
                range: { start: 0, end: 1 },
                children: [
                  { id: 'inline-code', type: 'inlineCode', text: 'a  b' },
                  { id: 'keyboard', type: 'keyboardInput', text: 'Ctrl' },
                  { id: 'break', type: 'lineBreak' },
                  {
                    id: 'formula',
                    type: 'inlineFormula',
                    formula: { latex: 'x' },
                  },
                  {
                    id: 'inline-image',
                    type: 'inlineImage',
                    resource: resource('https://example.com/image.png'),
                  },
                  {
                    id: 'unsupported',
                    type: 'unsupported',
                    sourceType: 'custom-element',
                    fallbackText: 'fallback',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    [...walkZhihuDocument(document)].map((node) => node.id),
    [
      'heading',
      ...formats,
      'formatted-text',
      'link',
      'segment',
      'inline-code',
      'keyboard',
      'break',
      'formula',
      'inline-image',
      'unsupported',
    ],
  );
});

test('visits footnote definitions once without following repeated or circular references', () => {
  const reference = (id: string): ZhihuInlineRun => ({
    id,
    type: 'footnoteReference',
    definitionId: 'definition',
    label: '1',
  });
  const document: ZhihuDocument = {
    id: 'document',
    blocks: [paragraph('main', [reference('ref-one'), reference('ref-two')])],
    footnotes: [
      {
        id: 'definition',
        label: '1',
        blocks: [paragraph('note', [text('note-text'), reference('self-ref')])],
      },
    ],
  };

  assert.deepEqual(
    [...walkZhihuDocument(document)].map((node) => node.id),
    ['main', 'ref-one', 'ref-two', 'note', 'note-text', 'self-ref'],
  );
});

test('collects content images in traversal order, deduplicates URLs and retains safe metadata', () => {
  const firstResource = {
    ...resource('  //example.com/first.png  '),
    originalUrl: 'https://example.com/original.png',
    width: 0,
    height: 480,
    mimeType: 'image/png',
    offlineUri: 'file:///cache/image.png',
    headers: { Cookie: 'test-only-cookie', Authorization: 'test-only-token' },
  };
  const document: ZhihuDocument = {
    id: 'document',
    blocks: [
      { id: 'first', type: 'image', resource: firstResource },
      {
        id: 'avatar',
        type: 'image',
        role: 'avatar',
        resource: resource('https://example.com/avatar.png'),
      },
      paragraph('inline', [
        {
          id: 'duplicate',
          type: 'inlineImage',
          resource: resource('https://example.com/first.png'),
        },
        {
          id: 'inline-avatar',
          type: 'inlineImage',
          role: 'avatar',
          resource: resource('https://example.com/inline-avatar.png'),
        },
        {
          id: 'second',
          type: 'inlineImage',
          role: 'content',
          resource: resource('http://example.com/second.jpg'),
        },
        {
          id: 'inline-formula',
          type: 'inlineFormula',
          formula: { image: resource('https://example.com/formula.png') },
        },
      ]),
      {
        id: 'block-formula',
        type: 'blockFormula',
        formula: { image: resource('https://example.com/block-formula.png') },
      },
      {
        id: 'video',
        type: 'video',
        url: 'https://example.com/video',
        poster: resource('https://example.com/poster.png'),
      },
      {
        id: 'card',
        type: 'linkCard',
        url: 'https://example.com/card',
        title: 'Card',
        image: resource('https://example.com/card.png'),
      },
      {
        id: 'caption-image',
        type: 'image',
        resource: resource(' https://example.com/first.png '),
        caption: [
          {
            id: 'third',
            type: 'inlineImage',
            resource: resource('https://example.com/third.png'),
          },
        ],
      },
    ],
    footnotes: [
      {
        id: 'note',
        label: '1',
        blocks: [
          {
            id: 'fourth',
            type: 'image',
            resource: resource('https://example.com/fourth.png'),
          },
        ],
      },
    ],
  };

  assert.deepEqual(getZhihuDocumentPreviewImages(document), [
    {
      mediaType: 'image',
      url: 'https://example.com/first.png',
      originalUrl: 'https://example.com/original.png',
      width: 0,
      height: 480,
      mimeType: 'image/png',
      offlineUri: 'file:///cache/image.png',
    },
    resource('http://example.com/second.jpg'),
    resource('https://example.com/third.png'),
    resource('https://example.com/fourth.png'),
  ]);
  assert.equal(firstResource.url, '  //example.com/first.png  ');
});

test.each([
  '',
  '  ',
  '/relative.png',
  'example.com/image.png',
  'data:image/png;base64,AA==',
  'file:///image.png',
  'ftp://example.com/image.png',
  'javascript:alert(1)',
  'https://',
  'https:example.com/image.png',
  'https://bad host/image.png',
  'https://example.com/line\nbreak.png',
  'https://user:password@example.com/image.png',
])('excludes an invalid or non-HTTP image URL %s', (url) => {
  assert.deepEqual(
    getZhihuDocumentPreviewImages({
      id: 'document',
      blocks: [{ id: 'image', type: 'image', resource: resource(url) }],
    }),
    [],
  );
});

test('walks deeply nested blocks and inline formats without overflowing the call stack', () => {
  const depth = 20_000;
  let inline: ZhihuInlineRun = text('leaf');
  for (let index = 0; index < depth; index += 1) {
    inline = { id: `strong-${index}`, type: 'strong', children: [inline] };
  }
  let block: ZhihuBlock = paragraph('paragraph', [inline]);
  for (let index = 0; index < depth; index += 1) {
    block = { id: `quote-${index}`, type: 'quote', blocks: [block] };
  }

  let count = 0;
  let lastId: string | undefined;
  for (const node of walkZhihuDocument({
    id: 'deep-document',
    blocks: [block],
  })) {
    count += 1;
    lastId = node.id;
  }
  assert.equal(count, depth * 2 + 2);
  assert.equal(lastId, 'leaf');
});
