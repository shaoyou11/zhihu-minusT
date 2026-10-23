import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuImageResource,
  ZhihuInlineRun,
} from './document';

type ZhihuContentNode = ZhihuBlock | ZhihuInlineRun;

function pushInReverse(
  stack: ZhihuContentNode[],
  nodes: readonly ZhihuContentNode[],
): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    stack.push(nodes[index]);
  }
}

function assertUnreachable(node: never): never {
  void node;
  throw new Error('Unsupported document node type');
}

/** 前序遍历块及行内节点；容器不输出，脚注定义在正文后只遍历一次。 */
export function* walkZhihuDocument(
  document: ZhihuDocument,
): IterableIterator<ZhihuContentNode> {
  const stack: ZhihuContentNode[] = [];

  const footnotes = document.footnotes ?? [];
  for (let index = footnotes.length - 1; index >= 0; index -= 1) {
    pushInReverse(stack, footnotes[index].blocks);
  }
  pushInReverse(stack, document.blocks);

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    yield node;

    switch (node.type) {
      case 'paragraph':
      case 'heading':
      case 'strong':
      case 'emphasis':
      case 'strikethrough':
      case 'underline':
      case 'highlight':
      case 'subscript':
      case 'superscript':
      case 'segmentHighlight':
      case 'link':
      case 'segment':
        pushInReverse(stack, node.children);
        break;
      case 'image':
        if (node.caption) pushInReverse(stack, node.caption);
        break;
      case 'list':
        for (let index = node.items.length - 1; index >= 0; index -= 1) {
          pushInReverse(stack, node.items[index].blocks);
        }
        break;
      case 'quote':
        pushInReverse(stack, node.blocks);
        break;
      case 'table': {
        const sections = [node.head ?? [], node.body, node.foot ?? []];
        for (let section = sections.length - 1; section >= 0; section -= 1) {
          const rows = sections[section];
          for (let row = rows.length - 1; row >= 0; row -= 1) {
            const cells = rows[row].cells;
            for (let cell = cells.length - 1; cell >= 0; cell -= 1) {
              pushInReverse(stack, cells[cell].blocks);
            }
          }
        }
        if (node.caption) pushInReverse(stack, node.caption);
        break;
      }
      case 'text':
      case 'inlineImage':
      case 'inlineFormula':
      case 'inlineCode':
      case 'keyboardInput':
      case 'footnoteReference':
      case 'lineBreak':
      case 'unsupported':
      case 'blockFormula':
      case 'code':
      case 'video':
      case 'linkCard':
      case 'divider':
        break;
      default:
        assertUnreachable(node);
    }
  }
}

function normalizePreviewUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(candidate) || /\s/.test(candidate)) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

/** 只收集正文图片，不包括头像、公式、视频封面与链接卡片缩略图。 */
export function getZhihuDocumentPreviewImages(
  document: ZhihuDocument,
): readonly ZhihuImageResource[] {
  const images: ZhihuImageResource[] = [];
  const seen = new Set<string>();

  for (const node of walkZhihuDocument(document)) {
    if (
      (node.type !== 'image' && node.type !== 'inlineImage') ||
      node.role === 'avatar'
    ) {
      continue;
    }

    const resource = node.resource;
    const url = normalizePreviewUrl(resource.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    // 显式复制允许的字段，防止外部数据中的请求头等额外字段进入预览。
    images.push({
      mediaType: 'image',
      url,
      ...(resource.originalUrl !== undefined && {
        originalUrl: resource.originalUrl,
      }),
      ...(resource.width !== undefined && { width: resource.width }),
      ...(resource.height !== undefined && { height: resource.height }),
      ...(resource.mimeType !== undefined && { mimeType: resource.mimeType }),
      ...(resource.offlineUri !== undefined && {
        offlineUri: resource.offlineUri,
      }),
    });
  }

  return images;
}
