import type { ZhihuSegmentReaction } from '@/types/zhihu';

/** Renderer V2 的语义模型；尚未接入 HTML normalization，不表示输入已清洗。 */
export interface ZhihuDocument {
  readonly id: string;
  readonly blocks: readonly ZhihuBlock[];
  /** 定义只存一份，行内引用通过 definitionId 指向定义的节点 ID。 */
  readonly footnotes?: readonly ZhihuFootnoteDefinition[];
}

/** normalization 负责生成文档内唯一、重复解析相同内容时稳定的 ID。 */
export interface ZhihuDocumentNode {
  readonly id: string;
}

export interface ZhihuResource {
  readonly mediaType: 'image' | 'video';
  readonly url: string;
  readonly originalUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  /** 缓存后的本地 URI；保留远程 URL 供回退和资源身份识别。 */
  readonly offlineUri?: string;
}

export interface ZhihuImageResource extends ZhihuResource {
  readonly mediaType: 'image';
}

export type ZhihuImageRole = 'content' | 'avatar';

export interface ZhihuVideoResource extends ZhihuResource {
  readonly mediaType: 'video';
}

/** 至少保留 LaTeX 或公式图片；两者可以同时存在。 */
export type ZhihuFormula =
  | {
      readonly latex: string;
      readonly image?: ZhihuImageResource;
    }
  | {
      readonly latex?: string;
      readonly image: ZhihuImageResource;
    };

/** 对应 ZhihuSegmentInfo.text 的 UTF-16 偏移，范围为 [start, end)。 */
export interface ZhihuTextRange {
  readonly start: number;
  readonly end: number;
}

export type ZhihuDocumentSegmentReaction = Readonly<
  Omit<ZhihuSegmentReaction, 'seg_ids'>
> & {
  readonly seg_ids?: readonly string[] | string;
};

export interface ZhihuTextRun extends ZhihuDocumentNode {
  readonly type: 'text';
  readonly text: string;
}

export interface ZhihuStrongRun extends ZhihuDocumentNode {
  readonly type: 'strong';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuEmphasisRun extends ZhihuDocumentNode {
  readonly type: 'emphasis';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuUnderlineRun extends ZhihuDocumentNode {
  readonly type: 'underline';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuStrikethroughRun extends ZhihuDocumentNode {
  readonly type: 'strikethrough';
  readonly children: readonly ZhihuInlineRun[];
}

/** 普通 mark 高亮，与带业务元数据的知识点高亮分开建模。 */
export interface ZhihuHighlightRun extends ZhihuDocumentNode {
  readonly type: 'highlight';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuSubscriptRun extends ZhihuDocumentNode {
  readonly type: 'subscript';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuSuperscriptRun extends ZhihuDocumentNode {
  readonly type: 'superscript';
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuInlineCodeRun extends ZhihuDocumentNode {
  readonly type: 'inlineCode';
  /** 保留原始空格和换行，不使用普通文本的空白折叠规则。 */
  readonly text: string;
}

export interface ZhihuKeyboardInputRun extends ZhihuDocumentNode {
  readonly type: 'keyboardInput';
  readonly text: string;
}

export interface ZhihuInlineImageRun extends ZhihuDocumentNode {
  readonly type: 'inlineImage';
  readonly resource: ZhihuImageResource;
  readonly role?: ZhihuImageRole;
  readonly alt?: string;
  readonly title?: string;
}

export interface ZhihuFootnoteReferenceRun extends ZhihuDocumentNode {
  readonly type: 'footnoteReference';
  readonly definitionId: string;
  /** 保留展示编号，不以 Number 强制转换知乎 data-numero。 */
  readonly label: string;
}

export interface ZhihuFootnoteDefinition extends ZhihuDocumentNode {
  readonly label: string;
  readonly blocks: readonly ZhihuBlock[];
}

export interface ZhihuLinkRun extends ZhihuDocumentNode {
  readonly type: 'link';
  /** 省略时为普通链接；保留知乎 @ 提及和 # 话题的语义。 */
  readonly kind?: 'link' | 'memberMention' | 'topicTag';
  readonly url: string;
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuInlineFormulaRun extends ZhihuDocumentNode {
  readonly type: 'inlineFormula';
  readonly formula: ZhihuFormula;
}

export interface ZhihuSegmentRun extends ZhihuDocumentNode {
  readonly type: 'segment';
  /** 知乎的 data-pid / ZhihuSegmentInfo.pid，并非节点 ID。 */
  readonly paragraphId: string;
  readonly range: ZhihuTextRange;
  readonly segInfo?: ZhihuDocumentSegmentReaction;
  readonly masterSegInfo?: ZhihuDocumentSegmentReaction;
  /** 保留片段内的链接、强调和公式，不能只剩切片后的纯文本。 */
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuSegmentHighlightReaction {
  readonly likeCount?: number;
  readonly commentCount?: number;
  readonly myCommentCount?: number;
  readonly isLiked?: boolean;
}

export interface ZhihuSegmentHighlightTarget {
  readonly contentId: string;
  readonly contentType: 'answer' | 'article';
}

export interface ZhihuSegmentHighlightLocation {
  readonly paragraphId: string;
  /** 非空段落文本范围；属性解析只校验数字和顺序，全文校验还需段落内容。 */
  readonly range: ZhihuTextRange;
}

/** 嵌入 HTML 的 highlight-wrap 属性，与接口 segment_infos 的标记分开。 */
export interface ZhihuSegmentHighlightMetadata {
  readonly segmentIds?: readonly string[];
  /** 跨段片段的菜单/复制文本；不参与本段 location 的偏移计算。 */
  readonly displayText?: string;
  readonly sourceUrl?: string;
  readonly isSpan?: boolean;
  readonly reaction?: ZhihuSegmentHighlightReaction;
  /** 目标和位置各自成组，缺失时不能用空 ID 或 0 偏移补造交互数据。 */
  readonly target?: ZhihuSegmentHighlightTarget;
  readonly location?: ZhihuSegmentHighlightLocation;
}

export interface ZhihuSegmentHighlightRun extends ZhihuDocumentNode {
  readonly type: 'segmentHighlight';
  /** 元数据不完整时仍保留知识点的视觉划线和嵌套格式。 */
  readonly highlight?: ZhihuSegmentHighlightMetadata;
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuLineBreakRun extends ZhihuDocumentNode {
  readonly type: 'lineBreak';
}

/** 显式保留未支持结构的文本；不保存可执行的原始 HTML。 */
export interface ZhihuUnsupportedNode extends ZhihuDocumentNode {
  readonly type: 'unsupported';
  readonly sourceType: string;
  readonly fallbackText: string;
}

export type ZhihuInlineRun =
  | ZhihuTextRun
  | ZhihuStrongRun
  | ZhihuEmphasisRun
  | ZhihuUnderlineRun
  | ZhihuStrikethroughRun
  | ZhihuHighlightRun
  | ZhihuSubscriptRun
  | ZhihuSuperscriptRun
  | ZhihuInlineCodeRun
  | ZhihuKeyboardInputRun
  | ZhihuInlineImageRun
  | ZhihuFootnoteReferenceRun
  | ZhihuLinkRun
  | ZhihuInlineFormulaRun
  | ZhihuSegmentRun
  | ZhihuSegmentHighlightRun
  | ZhihuLineBreakRun
  | ZhihuUnsupportedNode;

export interface ZhihuParagraphBlock extends ZhihuDocumentNode {
  readonly type: 'paragraph';
  readonly paragraphId?: string;
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuHeadingBlock extends ZhihuDocumentNode {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly paragraphId?: string;
  readonly children: readonly ZhihuInlineRun[];
}

export interface ZhihuImageBlock extends ZhihuDocumentNode {
  readonly type: 'image';
  /** Observed structured-content layout; small retains the source display width. */
  readonly layout?: 'normal' | 'small';
  /** 省略时为正文图片；日报作者头像需要独立布局。 */
  readonly role?: ZhihuImageRole;
  readonly resource: ZhihuImageResource;
  readonly alt?: string;
  readonly caption?: readonly ZhihuInlineRun[];
}

export interface ZhihuBlockFormula extends ZhihuDocumentNode {
  readonly type: 'blockFormula';
  readonly formula: ZhihuFormula;
}

export interface ZhihuListItem extends ZhihuDocumentNode {
  /** 列表项保留块级结构，支持嵌套列表、引用和多段落。 */
  readonly blocks: readonly ZhihuBlock[];
}

export interface ZhihuListBlock extends ZhihuDocumentNode {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly start?: number;
  readonly items: readonly ZhihuListItem[];
}

export interface ZhihuQuoteBlock extends ZhihuDocumentNode {
  readonly type: 'quote';
  readonly blocks: readonly ZhihuBlock[];
}

export interface ZhihuCodeBlock extends ZhihuDocumentNode {
  readonly type: 'code';
  readonly text: string;
  readonly language?: string;
}

export interface ZhihuVideoBlock extends ZhihuDocumentNode {
  readonly type: 'video';
  /** 视频页面业务 ID，与文档节点 ID 分开。 */
  readonly videoId?: string;
  /** Lens 播放资源 ID，优先于可能不同的 zvideo 页面 ID。 */
  readonly lensId?: string;
  /** 视频页面链接；可播放资源存在时单独提供。 */
  readonly url: string;
  readonly resource?: ZhihuVideoResource;
  readonly poster?: ZhihuImageResource;
  readonly title?: string;
}

export interface ZhihuLinkCardBlock extends ZhihuDocumentNode {
  readonly type: 'linkCard';
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  readonly image?: ZhihuImageResource;
}

export interface ZhihuDividerBlock extends ZhihuDocumentNode {
  readonly type: 'divider';
}

export type ZhihuTableAlignment = 'default' | 'left' | 'center' | 'right';

export interface ZhihuTableCell extends ZhihuDocumentNode {
  readonly isHeader: boolean;
  readonly alignment?: ZhihuTableAlignment;
  /** 合并跨度由 normalization 校验为正整数，省略时为 1。 */
  readonly colSpan?: number;
  readonly rowSpan?: number;
  /** 单元格可以包含段落、列表等块结构。 */
  readonly blocks: readonly ZhihuBlock[];
}

export interface ZhihuTableRow extends ZhihuDocumentNode {
  readonly cells: readonly ZhihuTableCell[];
}

export interface ZhihuTableBlock extends ZhihuDocumentNode {
  readonly type: 'table';
  readonly caption?: readonly ZhihuInlineRun[];
  readonly columnAlignments?: readonly ZhihuTableAlignment[];
  readonly head?: readonly ZhihuTableRow[];
  readonly body: readonly ZhihuTableRow[];
  readonly foot?: readonly ZhihuTableRow[];
}

export type ZhihuBlock =
  | ZhihuParagraphBlock
  | ZhihuHeadingBlock
  | ZhihuImageBlock
  | ZhihuBlockFormula
  | ZhihuListBlock
  | ZhihuQuoteBlock
  | ZhihuCodeBlock
  | ZhihuVideoBlock
  | ZhihuLinkCardBlock
  | ZhihuDividerBlock
  | ZhihuTableBlock
  | ZhihuUnsupportedNode;
