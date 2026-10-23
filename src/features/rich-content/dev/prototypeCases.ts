import type { ZhihuSegmentInfo } from '@/types/zhihu';
import type { RichContentVariant } from '../imagePolicy';

export interface RichContentPrototypeCase {
  id: string;
  title: string;
  hint: string;
  html: string;
  segmentInfos?: readonly ZhihuSegmentInfo[];
  variant?: RichContentVariant;
}

function svgSource(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function imageTag(source: string, attributes: string): string {
  return `<img src="${source}" ${attributes}/>`;
}

const inlineIcon = svgSource(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1f9d76"/><path d="M5 12l4 4 10-10" fill="none" stroke="white" stroke-width="3"/></svg>',
);
const formula = svgSource(
  '<svg xmlns="http://www.w3.org/2000/svg" width="108" height="28" viewBox="0 0 108 28"><rect width="108" height="28" rx="3" fill="#f8f8f8"/><text x="4" y="21" font-family="serif" font-size="21" fill="#202020">E = mc²</text></svg>',
);
const blockFormula = svgSource(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60"><rect width="240" height="60" rx="6" fill="#f8f8f8"/><text x="35" y="38" font-family="serif" font-size="28" fill="#202020">∫₀¹ x² dx = ⅓</text></svg>',
);
const shortFormula = svgSource(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="24" viewBox="0 0 12 24"><text x="2" y="20" font-family="serif" font-style="italic" font-size="20" fill="#202020">I</text></svg>',
);
const landscape = svgSource(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#e3f0f5"/><circle cx="470" cy="75" r="32" fill="#f5c56b"/><path d="M0 270L150 70L300 270L420 120L600 300H0Z" fill="#8bb4ac"/><path d="M0 300L240 145L400 300Z" fill="#416f73"/></svg>',
);

const segmentText =
  '知识点使用段落中的稳定范围，点击划线文字可以打开本地菜单，同时保留粗体、链接与连续选择。';
const segmentStart = segmentText.indexOf('稳定范围');
const highlightText =
  '另一种知识点来自 highlight-wrap，独立保留展示文本和互动信息。';

/** Synthetic examples only; no real accounts, objects, or mutation requests. */
export const richContentPrototypeCases: readonly RichContentPrototypeCase[] = [
  {
    id: 'selection',
    title: '跨段选择',
    hint: '长按文字，再把右侧选择柄拖进下一段；选区面板会显示两个段落的源位置。',
    html: '<h2>正文是一条连续文本流</h2><p data-pid="selection-a">第一段：从这里开始长按。粗体<strong>仍然可以被选中</strong>，链接<a href="https://example.com/reading">也留在同一个文本面</a>。把选择柄继续拖过段落间距。</p><p data-pid="selection-b">第二段：这段文字与上段共享原生选择上下文。复制选区时，段落换行会保留，生成的列表符号不会被当作段落的源偏移。</p><blockquote><p data-pid="selection-quote">引用、标题和简单列表也可以继续留在这个文本流内。</p></blockquote><ol><li>第一项：测试跨越标题与列表。</li><li>第二项：emoji 👩🏽‍💻 与组合文字 café 一同参与系统选择。</li></ol>',
  },
  {
    id: 'decorations',
    title: '装饰线',
    hint: '展开调节，切换实线、虚线、点线和波浪线；观察装饰如何跟随换行与字号。',
    html: '<h2>范围装饰与文字样式叠加</h2><p data-pid="decoration-a">这段<span class="highlight-wrap">跨越多行的装饰范围刻意写得很长，包含<strong>粗体</strong>、<em>斜体</em>与中文标点；当你调整字号或版心时，装饰线应根据每一行的实际位置重新绘制</span>。</p><p data-pid="decoration-b">这里有<mark>背景高亮</mark>、<s>删除线</s>、H<sub>2</sub>O、x<sup>2</sup> 和 <code>inline_code()</code>。装饰开关只控制自定义范围线。</p>',
  },
  {
    id: 'attachments',
    title: '行内附件',
    hint: '小图和公式占据真正的行内位置；选中它们后，用下方按钮复制替代文本。',
    html: `<h2>图片、公式和文字一起断行</h2><p data-pid="attachment-a">状态 ${imageTag(inlineIcon, 'width="24" height="24" alt="完成图标"')} 已完成。能量公式 ${imageTag(formula, 'eeimg="1" width="108" height="28" alt="E=mc^2"')} 保持行内；前后的文字不需要拆成横向组件。</p><p data-pid="attachment-b">我们再放一次 ${imageTag(formula, 'eeimg="1" width="108" height="28" alt="E=mc^2"')}，观察当这一行靠近右边缘时，附件能否整体换到下一行。点击绿色小图可预览，长按可打开图片菜单。</p><ul><li data-pid="attachment-list">单位矩阵 ${imageTag(shortFormula, 'eeimg="1" width="12" height="24" alt="I"')} 保持在这句话中，不应单独另起一段。</li></ul>${imageTag(blockFormula, 'eeimg="2" width="240" height="60" alt="\\int_0^1 x^2 dx=\\frac13"')}<p>上面的独立公式是一个媒体边界；跨边界的文章级选择留待后续实施。</p>`,
  },
  {
    id: 'segments',
    title: '知识点',
    hint: '点击知识点划线，查看段落 ID、局部范围与本地点赞；此页不会向知乎提交操作。',
    html: `<h2>知识点不打断文本流</h2><p data-pid="segment-a">知识点使用段落中的<strong>稳定范围</strong>，点击划线文字可以打开本地菜单，同时保留粗体、链接与连续选择。</p><p data-pid="segment-b"><span class="highlight-wrap" data-highlight-id="prototype-highlight" data-highlight-display-text="${highlightText}" data-highlight-like-count="12" data-highlight-comment-count="3" data-highlight-is-like="false" data-highlight-pid="segment-b" data-highlight-start-offset="0" data-highlight-end-offset="${highlightText.length}">${highlightText}</span></p><p data-pid="segment-c">两种来源都编成范围装饰，菜单使用模型中的节点身份与源映射，不靠屏幕坐标猜测段落。</p>`,
    segmentInfos: [
      {
        pid: 'segment-a',
        text: segmentText,
        marks: [
          {
            start_index: segmentStart,
            end_index: segmentStart + '稳定范围'.length,
            seg_info: {
              like_count: 8,
              comment_count: 2,
              is_like: false,
              seg_ids: ['prototype-segment'],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'media',
    title: '媒体与表格',
    hint: '图片可预览，卡片可打开链接，视频占位展示不可用状态；表格与代码可横向滚动，脚注点开后可返回正文。',
    html: `<h2>独立 block 与正文配合</h2><p>媒体保留独立布局，正文从下一条文本流继续。</p><figure>${imageTag(landscape, 'width="600" height="300" alt="合成山景" data-rawwidth="600" data-rawheight="300"')}<figcaption>全部使用本地合成图形。</figcaption></figure><a class="LinkCard" href="https://example.com/typography" data-draft-title="一个排版参考卡片">一个排版参考卡片</a><a class="video-box" href="https://example.com/video" data-lens-id="prototype-video">视频页面占位（无播放资源）</a><table><caption>表格横向滚动</caption><thead><tr><th>内容类型</th><th>原型行为</th><th>选择边界</th></tr></thead><tbody><tr><td>普通段落</td><td>连续文本流</td><td>同一流可跨段</td></tr><tr><td>图片 / 视频</td><td>独立媒体布局</td><td>形成媒体边界</td></tr><tr><td>表格</td><td>原生滚动容器</td><td>单元格文本</td></tr></tbody></table><pre><code>const typography = { fontSize: 17, lineHeight: 1.6, paragraphSpacing: 14 };\nconsole.log('横向滚动查看长行');</code></pre><p data-pid="footnote-a">这句话带有一条脚注<a class="footnote-ref" data-numero="1">[1]</a>。点击编号即可查看解释。</p><section class="footnotes"><ol><li data-numero="1"><p>这是一条合成脚注。定义只保存一次，正文中的引用指向这条定义；点击“返回正文”关闭面板。</p></li></ol></section>`,
  },
  {
    id: 'typography',
    title: '中西混排',
    hint: '调整字号、行高、双齐和整字版心；浏览器对照还可观察中西间距与标点压缩。',
    html: '<h2>让阅读的节奏更稳定</h2><p data-pid="typography-a">React Native 0.83 与 Expo SDK 55 让这段文字在 Android 与 iOS 上保持系统原生排版。中文与 Latin letters、2026 年、17px、UTF-16 混排时，先统一字号、行高和段距，再观察最小的排版策略带来的变化。</p><p data-pid="typography-b">“引号不应孤零零地留在行尾”，括号（以及嵌套的〈书名〉）也需要合适的断行。A long English word like internationalization should follow the platform line breaker，而链接 https://example.com/reading 则要有可用的换行机会。</p><p data-pid="typography-c">双齐使用各平台的系统文字布局；整字版心以当前字号与系统字体缩放确定文字宽度。中西文自动间距和标点压缩在 WebView 对照中用 CSS 试验，原生流仍保留原始字符与偏移。</p><hr/><p>最后一行不需要为了填满右边缘而过度拉开，段落之间保持清楚的层次。</p>',
  },
];
