import { Parser } from 'htmlparser2';
import { RE2JS } from 're2js';
import type { FeedItem } from '@/api/zhihu/feed';

/** Mobile resource budgets; oversized sources/bodies are rejected, never sliced. */
export const FEED_REGEX_LIMITS = {
  patterns: 20,
  patternLength: 256,
  inputLength: 16_384,
  programSize: 4096,
  htmlLength: 262_144,
  textLength: 65_536,
  segments: 2048,
} as const;

/** Compile bounded RE2 rules without native RegExp fallback. */
function compilePattern(pattern: string): RE2JS | null {
  if (
    pattern.length === 0 ||
    pattern.length > FEED_REGEX_LIMITS.patternLength
  ) {
    return null;
  }
  try {
    // Unicode code points are intrinsic to RE2; DOTALL includes paragraph breaks.
    const expression = RE2JS.compile(pattern, RE2JS.DOTALL);
    return expression.programSize() <= FEED_REGEX_LIMITS.programSize
      ? expression
      : null;
  } catch {
    return null;
  }
}

/** Accept bounded, unique, nonempty RE2 sources from persisted settings. */
export function normalizeFeedRegexPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const patterns = new Set<string>();
  for (const entry of value) {
    if (patterns.size === FEED_REGEX_LIMITS.patterns) break;
    if (typeof entry !== 'string') continue;
    const pattern = entry.trim();
    if (!patterns.has(pattern) && compilePattern(pattern))
      patterns.add(pattern);
  }
  return Array.from(patterns);
}

/** Errors use original editor line numbers; unsupported/oversized rules cannot save. */
export function parseFeedRegexInput(input: string): {
  patterns: string[];
  invalidLines: number[];
} {
  if (input.length > FEED_REGEX_LIMITS.inputLength) {
    return { patterns: [], invalidLines: [1] };
  }
  const patterns = new Set<string>();
  const invalidLines: number[] = [];
  input.split(/\r?\n/).forEach((line, index) => {
    const pattern = line.trim();
    if (!pattern || patterns.has(pattern)) return;
    if (patterns.size < FEED_REGEX_LIMITS.patterns && compilePattern(pattern)) {
      patterns.add(pattern);
    } else {
      invalidLines.push(index + 1);
    }
  });
  return { patterns: Array.from(patterns), invalidLines };
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'blockquote',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'tr',
]);
const IGNORED_TAGS = new Set(['script', 'style', 'noscript']);

/** Read visible text without markup or attribute values, decoding HTML entities. */
function htmlToFilterText(html: string): string {
  const parts: string[] = [];
  let hiddenDepth = 0;
  const hiddenStack: boolean[] = [];
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const hidden =
          IGNORED_TAGS.has(name) ||
          'hidden' in attributes ||
          attributes['aria-hidden'] === 'true';
        hiddenStack.push(hidden);
        if (hidden) hiddenDepth += 1;
        if (hiddenDepth === 0 && (name === 'br' || BLOCK_TAGS.has(name))) {
          parts.push('\n');
        }
      },
      ontext(text) {
        if (hiddenDepth === 0) parts.push(text);
      },
      onclosetag(name) {
        if (hiddenStack.pop()) hiddenDepth -= 1;
        if (hiddenDepth === 0 && BLOCK_TAGS.has(name)) parts.push('\n');
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return parts
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

const compiledPatterns = new WeakMap<
  readonly string[],
  readonly RE2JS[] | null
>();
const bodyTexts = new WeakMap<FeedItem, string>();

/** Cache text only from complete, bounded bodies, retaining paragraph boundaries. */
function getBodyText(item: FeedItem): string {
  const cached = bodyTexts.get(item);
  if (cached !== undefined) return cached;
  const content = item.content;
  let html = '';
  if (typeof content === 'string') {
    if (content.length <= FEED_REGEX_LIMITS.htmlLength) html = content;
  } else if (
    Array.isArray(content) &&
    content.length <= FEED_REGEX_LIMITS.segments
  ) {
    const parts: string[] = [];
    let length = 0;
    for (const segment of content) {
      if (segment.type !== 'text') continue;
      const part = segment.content || segment.own_text || '';
      length += part.length + (parts.length > 0 ? 1 : 0);
      if (length > FEED_REGEX_LIMITS.htmlLength) {
        parts.length = 0;
        break;
      }
      parts.push(part);
    }
    html = parts.join('\n');
  }
  const text = htmlToFilterText(html);
  const boundedText = text.length <= FEED_REGEX_LIMITS.textLength ? text : '';
  bodyTexts.set(item, boundedText);
  return boundedText;
}

/** Cache compiled rules by their immutable settings array, stopping at the rule cap. */
function compilePatterns(patterns: readonly string[]): readonly RE2JS[] | null {
  const sources = new Set<string>();
  const expressions: RE2JS[] = [];
  for (const entry of patterns) {
    if (expressions.length === FEED_REGEX_LIMITS.patterns) break;
    if (typeof entry !== 'string') continue;
    const source = entry.trim();
    if (sources.has(source)) continue;
    const expression = compilePattern(source);
    if (!expression) continue;
    sources.add(source);
    expressions.push(expression);
  }
  return expressions.length > 0 ? expressions : null;
}

/** Match complete recommendation bodies with linear-time RE2; never execute user RegExp. */
export function matchesFeedRegex(
  item: FeedItem,
  patterns: readonly string[],
): boolean {
  if (
    !Array.isArray(patterns) ||
    patterns.length === 0 ||
    item.contentNeedTruncated === true
  ) {
    return false;
  }
  let expressions = compiledPatterns.get(patterns);
  if (expressions === undefined) {
    expressions = compilePatterns(patterns);
    compiledPatterns.set(patterns, expressions);
  }
  if (expressions === null) return false;
  const text = getBodyText(item);
  // find() requests match boundaries, bypassing RE2JS 2.9.0's DFA Unicode
  // transition cache. Its one-pass/NFA or memoized bit-state paths avoid
  // exponential backtracking; test() and RE2Set.match() use that DFA cache.
  return (
    text.length > 0 &&
    expressions.some((expression) => expression.matcher(text).find())
  );
}
