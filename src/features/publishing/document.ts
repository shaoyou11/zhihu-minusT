import { isTag, isText } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { UploadedImage } from '@/api/zhihu/image';
import {
  deserializePublishingHtml,
  serializePublishingMarkdown,
} from './serializer';

export type PublishingBlock =
  | {
      id: string;
      kind: 'markdown';
      value: string;
      originalValue: string;
      originalHtml: string;
    }
  | { id: string; kind: 'preserved'; html: string; visible: boolean };

/** Original blocks remain byte-for-byte intact until deliberately edited. */
export interface PublishingDocument {
  originalHtml: string;
  blocks: PublishingBlock[];
}

const EDITABLE_TAGS = new Set([
  'p',
  'h2',
  'h3',
  'strong',
  'b',
  'em',
  'i',
  'a',
  'br',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
]);

function canEdit(
  node: ReturnType<typeof parseDocument>['children'][number],
): boolean {
  if (isText(node)) return true;
  if (!isTag(node) || !EDITABLE_TAGS.has(node.name)) return false;
  if (
    (node.name === 'code' || node.name === 'pre') &&
    node.children.some((child) => isText(child) && child.data.includes('`'))
  )
    return false;
  const allowedAttributes =
    node.name === 'a' ? ['href'] : node.name === 'pre' ? ['lang'] : [];
  if (
    Object.keys(node.attribs).some((name) => !allowedAttributes.includes(name))
  )
    return false;
  // Nested lists/quotes and block code need richer structural editing; keep
  // their source intact instead of exposing the lossy Markdown conversion.
  if (node.name === 'ul' || node.name === 'ol' || node.name === 'blockquote')
    return false;
  return node.children.every(canEdit);
}

function canonical(
  node: ReturnType<typeof parseDocument>['children'][number],
): unknown {
  if (isText(node)) return node.data;
  if (!isTag(node)) return null;
  const name =
    node.name === 'b' ? 'strong' : node.name === 'i' ? 'em' : node.name;
  const attributes = { ...node.attribs };
  if (name === 'a' && attributes.href) {
    try {
      attributes.href = new URL(attributes.href).href;
    } catch {
      /* Keep invalid source protected. */
    }
  }
  return { name, attributes, children: node.children.map(canonical) };
}

export function createPublishingDocument(html: string): PublishingDocument {
  const tree = parseDocument(html, {
    withStartIndices: true,
    withEndIndices: true,
  });
  const blocks: PublishingBlock[] = tree.children.map((node, index) => {
    const source = html.slice(
      node.startIndex ?? 0,
      (node.endIndex ?? html.length - 1) + 1,
    );
    const id = `source-${index}`;
    if (canEdit(node) && source.trim()) {
      const value = deserializePublishingHtml(source);
      const rebuilt = parseDocument(
        serializePublishingMarkdown(value),
      ).children;
      if (
        value &&
        rebuilt.length === 1 &&
        JSON.stringify(canonical(node)) ===
          JSON.stringify(canonical(rebuilt[0]))
      ) {
        return {
          id,
          kind: 'markdown',
          value,
          originalValue: value,
          originalHtml: source,
        };
      }
    }
    return {
      id,
      kind: 'preserved',
      html: source,
      visible: node.type !== 'comment' && Boolean(source.trim()),
    };
  });
  const grouped: PublishingBlock[] = [];
  for (const [index, block] of blocks.entries()) {
    const previous = grouped.at(-1);
    if (
      previous?.kind === 'markdown' &&
      block.kind === 'preserved' &&
      !block.html.trim() &&
      blocks[index + 1]?.kind === 'markdown'
    ) {
      previous.originalHtml += block.html;
    } else if (previous?.kind === 'markdown' && block.kind === 'markdown') {
      previous.value += `\n\n${block.value}`;
      previous.originalValue = previous.value;
      previous.originalHtml += block.originalHtml;
    } else grouped.push(block);
  }
  return { originalHtml: html, blocks: grouped };
}

export function serializePublishingDocument(
  document: PublishingDocument,
  images: readonly UploadedImage[] = [],
): string {
  return document.blocks
    .map((block) => {
      if (block.kind === 'preserved') return block.html;
      if (block.value === block.originalValue) return block.originalHtml;
      return serializePublishingMarkdown(block.value, images);
    })
    .join('');
}

export function hasPublishingDocumentContent(
  document: PublishingDocument,
): boolean {
  return document.blocks.some((block) =>
    block.kind === 'markdown' ? Boolean(block.value.trim()) : block.visible,
  );
}
