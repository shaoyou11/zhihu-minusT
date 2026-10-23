import { Image } from 'react-native';
import type { ZhihuStructuredContent } from '@/types/zhihu';
import type { ZhihuImageResource } from '../document';
import capturedA from '../fixtures/inbox/structured-content/capture-derived/answer-0.json';
import capturedB from '../fixtures/inbox/structured-content/capture-derived/answer-1.json';
import capturedC from '../fixtures/inbox/structured-content/capture-derived/answer-2.json';
import capturedD from '../fixtures/inbox/structured-content/capture-derived/answer-3.json';
import capturedE from '../fixtures/inbox/structured-content/capture-derived/answer-4.json';
import headingOverlap from '../fixtures/inbox/structured-content/heading-overlap.json';
import { parseZhihuStructuredContent } from '../structuredContent';

export { mergeStructuredContentPages } from '../structuredContent';

export interface StructuredContentCase {
  id: string;
  title: string;
  hint: string;
  source: 'capture-derived' | 'synthetic';
  originalArrayIndex?: number;
  pages: readonly ZhihuStructuredContent[];
  resources: Record<string, ZhihuImageResource>;
}

const icon = Image.resolveAssetSource(require('@/assets/images/icon.png'));
const sunset = Image.resolveAssetSource(
  require('@/assets/images/app-icons/sunset.png'),
);
const aurora = Image.resolveAssetSource(
  require('@/assets/images/app-icons/aurora.png'),
);
const resources: Record<string, ZhihuImageResource> = {};
for (const [name, asset] of [
  ['icon', icon],
  ['sunset', sunset],
  ['aurora', aurora],
] as const) {
  if (!asset) {
    throw new Error('Structured content fixture image is unavailable.');
  }
  const url = `https://example.invalid/images/${name}.png`;
  resources[url] = {
    mediaType: 'image',
    url,
    offlineUri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: 'image/png',
  };
}
/** Captured structure with redacted identities and original public image CDN URLs. */
export const structuredContentCases: readonly StructuredContentCase[] = [
  {
    id: 'list-formula',
    title: 'A：列表与公式',
    hint: '原 data[0]：6 个分段、4 个列表项、9 个行内公式和提及链接。',
    source: 'capture-derived',
    originalArrayIndex: capturedA.originalArrayIndex,
    pages: capturedA.pages.map(parseZhihuStructuredContent),
    resources: {},
  },
  {
    id: 'heading-overlap',
    title: 'B：标题与重叠标记',
    hint: '原 data[1]：20 个分段，标题、粗体与词条叠加。原样本未捕获续页。',
    source: 'capture-derived',
    originalArrayIndex: capturedB.originalArrayIndex,
    pages: capturedB.pages.map(parseZhihuStructuredContent),
    resources: {},
  },
  {
    id: 'dense-formula',
    title: 'C：密集公式与分隔线',
    hint: '原 data[2]：11 个分段、44 个行内公式和 hr 分隔节点。',
    source: 'capture-derived',
    originalArrayIndex: capturedC.originalArrayIndex,
    pages: capturedC.pages.map(parseZhihuStructuredContent),
    resources: {},
  },
  {
    id: 'images-layout',
    title: 'D：normal / small 图片',
    hint: '原 data[3]：7 个分段，normal 与 small 图片布局及搜索词条。',
    source: 'capture-derived',
    originalArrayIndex: capturedD.originalArrayIndex,
    pages: capturedD.pages.map(parseZhihuStructuredContent),
    resources: {},
  },
  {
    id: 'paragraph-link',
    title: 'E：段落与文字链接',
    hint: '原 data[4]：4 个段落、2 个搜索词条和一个 text 链接。',
    source: 'capture-derived',
    originalArrayIndex: capturedE.originalArrayIndex,
    pages: capturedE.pages.map(parseZhihuStructuredContent),
    resources: {},
  },
  {
    id: 'synthetic-pagination',
    title: '合成：本地续页边界',
    hint: '独立合成案例：本地续页更新重复节点，用于检验分页和展开状态。',
    source: 'synthetic',
    pages: headingOverlap.pages.map(parseZhihuStructuredContent),
    resources,
  },
];
