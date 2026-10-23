import assert from 'node:assert/strict';
import {
  deserializePublishingHtml,
  serializePinText,
  serializePublishingMarkdown,
} from '../src/features/publishing/serializer';

test('serializes the supported publishing Markdown blocks', () => {
  assert.equal(
    serializePublishingMarkdown(
      '# 标题\n\n普通 **粗体** 和 [链接](https://example.com)\n\n- 一\n- 二',
    ),
    '<h2>标题</h2><p>普通 <strong>粗体</strong> 和 <a href="https://example.com/">链接</a></p><ul><li>一</li><li>二</li></ul>',
  );
});

test('serializes uploaded images as Zhihu content images', () => {
  assert.equal(
    serializePublishingMarkdown(
      '图片如下：\n\n![封面](https://pic1.zhimg.com/example.png "1200x800")',
    ),
    '<p>图片如下：</p><p><img src="https://pic1.zhimg.com/example.png" alt="封面" data-caption="封面" data-size="normal" data-rawwidth="1200" data-rawheight="800" data-original-src="https://pic1.zhimg.com/example.png" /></p>',
  );
});

test('preserves uploaded image watermark metadata', () => {
  assert.equal(
    serializePublishingMarkdown(
      '![图](https://pic.example/rendered.jpg "1216x5384")',
      [
        {
          imageId: 'image-id',
          src: 'https://pic.example/rendered.jpg',
          originalSrc: 'https://pic.example/original.jpg',
          watermark: 'watermark',
          watermarkSrc: 'https://pic.example/watermarked.jpg',
          width: 1216,
          height: 5384,
        },
      ],
    ),
    '<p><img src="https://pic.example/rendered.jpg" alt="图" data-caption="图" data-size="normal" data-rawwidth="1216" data-rawheight="5384" data-watermark="watermark" data-watermark-src="https://pic.example/watermarked.jpg" data-private-watermark-src="" data-original-src="https://pic.example/original.jpg" /></p>',
  );
});

test('escapes HTML and rejects unsafe links', () => {
  assert.equal(
    serializePublishingMarkdown(
      '<script>alert(1)</script> [点我](javascript:unsafe)',
    ),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; 点我</p>',
  );
});

test('serializes fenced code without interpreting markup', () => {
  assert.equal(
    serializePublishingMarkdown('```ts\nconst value = "<safe>";\n```'),
    '<pre lang="ts">const value = &quot;&lt;safe&gt;&quot;;</pre>',
  );
});

test('serializes pin text without treating it as rich Markdown', () => {
  assert.equal(
    serializePinText('第一行 **不是粗体**\n\n<script>'),
    '<p>第一行 **不是粗体**</p><p><br></p><p>&lt;script&gt;</p>',
  );
});

test('deserializes editable answer HTML into the publishing Markdown subset', () => {
  assert.equal(
    deserializePublishingHtml(
      '<p>普通 <strong>粗体</strong> 和 <a href="https://example.com">链接</a></p><ul><li>一</li><li>二</li></ul>',
    ),
    '普通 **粗体** 和 [链接](https://example.com/)\n- 一\n- 二',
  );
});

test('preserves literal syntax inside inline code and reserved-looking text', () => {
  assert.equal(
    serializePublishingMarkdown(
      '`**literal** [link](https://example.com)` %%__ZHIHU_PUBLISH_TOKEN_0__%%',
    ),
    '<p><code>**literal** [link](https://example.com)</code> %%__ZHIHU_PUBLISH_TOKEN_0__%%</p>',
  );
});

test('preserves supported heading, list, quote and code formatting when editing', () => {
  const markdown =
    '# 标题\n\n## 小标题\n\n1. 第一项\n2. 第二项\n\n> 引用一\n> 引用二\n\n```ts\nconst text = "<b>&";\n\n// 空行\n```';
  const html = serializePublishingMarkdown(markdown);
  assert.equal(
    serializePublishingMarkdown(deserializePublishingHtml(html)),
    html,
  );
});

test('decodes escaped URL query parameters and numeric text entities', () => {
  assert.equal(
    deserializePublishingHtml(
      '<p>&#x4E2D;&#25991; <a href="https://example.com/?a=1&amp;b=2">链接</a></p>',
    ),
    '中文 [链接](https://example.com/?a=1&b=2)',
  );
});

test.each([
  '[`code`](https://example.com)',
  '> `code`',
  '> ```ts\n> const text = "<b>&";\n> ```',
])(
  'restores nested code tokens without publishing placeholders (%s)',
  (markdown) => {
    const html = serializePublishingMarkdown(markdown);
    const restored = deserializePublishingHtml(html);
    assert.equal(html.includes('ZHIHU_PUBLISH_TOKEN'), false);
    assert.equal(restored.includes('ZHIHU_PUBLISH_TOKEN'), false);
    assert.equal(serializePublishingMarkdown(restored), html);
  },
);
