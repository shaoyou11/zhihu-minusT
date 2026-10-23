import assert from 'node:assert/strict';
import {
  parseRichContentBridgeMessage,
  type RichContentBridgeMessage,
  type TextSelectionInfo,
} from '../bridge';

const selection: TextSelectionInfo = {
  text: '  selected text  ',
  startParagraphId: 'paragraph-one',
  endParagraphId: 'paragraph-one',
  startOffset: 2,
  endOffset: 17,
};

const validMessages: RichContentBridgeMessage[] = [
  { type: 'height', height: 400.5 },
  { type: 'image', src: 'https://example.com/image.png' },
  { type: 'image_long_press', src: 'https://example.com/image.png' },
  { type: 'link', href: '/question/1' },
  { type: 'segment', pid: 'paragraph-one' },
  {
    type: 'segment',
    pid: 'paragraph-one',
    nodeId: 'paragraph-one:segment:2:17',
  },
  { type: 'selection', info: selection },
  { type: 'selection', info: null },
];

test.each(validMessages)('decodes a valid $type message', (message) => {
  assert.deepEqual(
    parseRichContentBridgeMessage(JSON.stringify(message)),
    message,
  );
});

test('projects known fields and preserves selected text whitespace', () => {
  assert.deepEqual(
    parseRichContentBridgeMessage(
      JSON.stringify({
        type: 'selection',
        extra: 'ignored',
        info: { ...selection, extra: 'ignored' },
      }),
    ),
    { type: 'selection', info: selection },
  );
  assert.deepEqual(
    parseRichContentBridgeMessage(
      JSON.stringify({ type: 'image', src: 'image.png', extra: 'ignored' }),
    ),
    { type: 'image', src: 'image.png' },
  );
});

test.each(['', '{', 'undefined', 'null', '1', '"message"', '[]'])(
  'rejects malformed JSON or non-object payload %s',
  (raw) => {
    assert.equal(parseRichContentBridgeMessage(raw), null);
  },
);

test.each([
  {},
  { type: 'unknown' },
  { type: 1 },
  { type: 'height' },
  { type: 'height', height: '400' },
  { type: 'height', height: 0 },
  { type: 'height', height: -1 },
  { type: 'height', height: null },
  { type: 'image' },
  { type: 'image', src: '' },
  { type: 'image', src: '  ' },
  { type: 'image', src: 1 },
  { type: 'image_long_press', src: false },
  { type: 'link', href: [] },
  { type: 'link', href: '\n' },
  { type: 'segment', pid: null },
  { type: 'segment', pid: '' },
  { type: 'segment', pid: 'paragraph-one', nodeId: null },
  { type: 'segment', pid: 'paragraph-one', nodeId: '' },
  { type: 'segment', pid: 'paragraph-one', nodeId: '  ' },
  { type: 'segment', pid: 'paragraph-one', nodeId: 1 },
  { type: 'selection' },
  { type: 'selection', info: [] },
  { type: 'selection', info: {} },
])('rejects a missing or invalid message field %j', (message) => {
  assert.equal(parseRichContentBridgeMessage(JSON.stringify(message)), null);
});

test.each(['1e999', '-1e999'])('rejects non-finite height %s', (height) => {
  assert.equal(
    parseRichContentBridgeMessage(`{"type":"height","height":${height}}`),
    null,
  );
});

test.each([
  { text: '' },
  { text: '  ' },
  { text: false },
  { startParagraphId: '' },
  { startParagraphId: 1 },
  { endParagraphId: '\n' },
  { endParagraphId: null },
  { startOffset: -1 },
  { startOffset: 1.5 },
  { startOffset: '1' },
  { startOffset: Number.MAX_SAFE_INTEGER + 1 },
  { endOffset: -1 },
  { endOffset: 1.5 },
  { endOffset: null },
  { endOffset: Number.MAX_SAFE_INTEGER + 1 },
  { endOffset: 1 },
])('rejects invalid selection field %j', (fields) => {
  assert.equal(
    parseRichContentBridgeMessage(
      JSON.stringify({ type: 'selection', info: { ...selection, ...fields } }),
    ),
    null,
  );
});

test('allows zero offsets and independently validates cross-paragraph offsets', () => {
  const info = {
    ...selection,
    endParagraphId: 'paragraph-two',
    startOffset: 10,
    endOffset: 0,
  };
  assert.deepEqual(
    parseRichContentBridgeMessage(JSON.stringify({ type: 'selection', info })),
    { type: 'selection', info },
  );
});

test('rejects non-finite selection offsets', () => {
  assert.equal(
    parseRichContentBridgeMessage(
      '{"type":"selection","info":{"text":"text","startParagraphId":"one","endParagraphId":"two","startOffset":1e999,"endOffset":0}}',
    ),
    null,
  );
});
