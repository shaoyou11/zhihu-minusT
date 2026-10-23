export interface TextSelectionInfo {
  text: string;
  startParagraphId: string;
  endParagraphId: string;
  /** UTF-16 offsets into each paragraph's DOM text content. */
  startOffset: number;
  endOffset: number;
}

export type RichContentBridgeMessage =
  | { type: 'height'; height: number }
  | { type: 'image'; src: string }
  | { type: 'image_long_press'; src: string }
  | { type: 'link'; href: string }
  | { type: 'segment'; pid: string; nodeId?: string }
  | { type: 'selection'; info: TextSelectionInfo | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTextOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseTextSelectionInfo(value: unknown): TextSelectionInfo | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.text) ||
    !isNonEmptyString(value.startParagraphId) ||
    !isNonEmptyString(value.endParagraphId) ||
    !isTextOffset(value.startOffset) ||
    !isTextOffset(value.endOffset)
  ) {
    return null;
  }

  if (
    value.startParagraphId === value.endParagraphId &&
    value.endOffset < value.startOffset
  ) {
    return null;
  }

  return {
    text: value.text,
    startParagraphId: value.startParagraphId,
    endParagraphId: value.endParagraphId,
    startOffset: value.startOffset,
    endOffset: value.endOffset,
  };
}

/** Decode untrusted WebView data without exposing its contents in diagnostics. */
export function parseRichContentBridgeMessage(
  raw: string,
  documentIdentity?: number,
): RichContentBridgeMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (
    documentIdentity !== undefined &&
    value.documentIdentity !== documentIdentity
  )
    return null;

  switch (value.type) {
    case 'height':
      return typeof value.height === 'number' &&
        Number.isFinite(value.height) &&
        value.height > 0
        ? { type: 'height', height: value.height }
        : null;
    case 'image':
    case 'image_long_press':
      return isNonEmptyString(value.src)
        ? { type: value.type, src: value.src }
        : null;
    case 'link':
      return isNonEmptyString(value.href)
        ? { type: 'link', href: value.href }
        : null;
    case 'segment':
      return isNonEmptyString(value.pid) &&
        (value.nodeId === undefined || isNonEmptyString(value.nodeId))
        ? {
            type: 'segment',
            pid: value.pid,
            ...(value.nodeId !== undefined && { nodeId: value.nodeId }),
          }
        : null;
    case 'selection': {
      if (value.info === null) return { type: 'selection', info: null };
      const info = parseTextSelectionInfo(value.info);
      return info ? { type: 'selection', info } : null;
    }
    default:
      return null;
  }
}
