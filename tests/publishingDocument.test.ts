import {
  createPublishingDocument,
  serializePublishingDocument,
} from '../src/features/publishing/document';

const COMPLEX =
  '<!--keep--><p>普通 <strong>文字</strong></p>\n<table data-extra="keep"><tr><td rowspan="2">表格</td></tr></table><p><span class="math" data-tex="x^2">公式</span></p><div class="video-box" data-video-id="synthetic"><iframe src="https://example.com/video"></iframe></div><blockquote><ol><li>嵌套<ul><li>列表</li></ul></li></ol></blockquote><p><img src="https://example.com/image" alt="原图" data-original-src="https://example.com/original"></p>';

test('unchanged complex source survives byte for byte', () => {
  const document = createPublishingDocument(COMPLEX);
  expect(serializePublishingDocument(document)).toBe(COMPLEX);
  expect(
    document.blocks.filter(
      (block) => block.kind === 'preserved' && block.visible,
    ),
  ).toHaveLength(5);
});

test('editing a text block preserves all neighboring complex source', () => {
  const document = createPublishingDocument(COMPLEX);
  const changed = {
    ...document,
    blocks: document.blocks.map((block) =>
      block.kind === 'markdown'
        ? { ...block, value: '修改后的 **文字**' }
        : block,
    ),
  };
  expect(serializePublishingDocument(changed)).toBe(
    COMPLEX.replace(
      '<p>普通 <strong>文字</strong></p>',
      '<p>修改后的 <strong>文字</strong></p>',
    ),
  );
});

test('a deliberate block deletion removes exactly that block', () => {
  const document = createPublishingDocument(COMPLEX);
  const table = document.blocks.find(
    (block) => block.kind === 'preserved' && block.html.startsWith('<table'),
  );
  expect(table?.kind).toBe('preserved');
  expect(
    serializePublishingDocument({
      ...document,
      blocks: document.blocks.filter((block) => block !== table),
    }),
  ).toBe(
    COMPLEX.replace(
      '<table data-extra="keep"><tr><td rowspan="2">表格</td></tr></table>',
      '',
    ),
  );
});

test('code containing Markdown delimiters and styled paragraphs remain protected', () => {
  const html =
    '<pre lang="ts">const text = `literal`;</pre><p style="color:red">特殊格式</p>';
  const document = createPublishingDocument(html);
  expect(document.blocks.every((block) => block.kind === 'preserved')).toBe(
    true,
  );
  expect(serializePublishingDocument(document)).toBe(html);
});

test('literal Markdown-looking text is protected if conversion could change its meaning', () => {
  const html =
    '<p>这里的 *星号* 和 [链接样式](https://example.com) 都是字面文字</p>';
  const document = createPublishingDocument(html);
  expect(document.blocks[0].kind).toBe('preserved');
  expect(serializePublishingDocument(document)).toBe(html);
});

test('adjacent paragraphs share an editor while trailing source whitespace stays outside it', () => {
  const html = '<p>第一段</p>\n\n<p>第二段</p>\n\t';
  const document = createPublishingDocument(html);
  expect(
    document.blocks.filter((block) => block.kind === 'markdown'),
  ).toHaveLength(1);
  expect(serializePublishingDocument(document)).toBe(html);
  const changed = {
    ...document,
    blocks: document.blocks.map((block) =>
      block.kind === 'markdown' ? { ...block, value: '修改内容' } : block,
    ),
  };
  expect(serializePublishingDocument(changed)).toBe('<p>修改内容</p>\n\t');
});
