import React, { useMemo } from 'react';
import {
  Linking,
  Text as NativeText,
  View as NativeView,
  StyleSheet,
} from 'react-native';
import { Text, useThemeColor } from '@/components/Themed';

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: MarkdownListItem[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

interface MarkdownListItem {
  depth: number;
  marker: string;
  ordered: boolean;
  text: string;
}

interface InlineContext {
  linkColor: string;
  codeBackground: string;
  codeColor: string;
}

export interface MarkdownTextProps {
  markdown: string;
  compact?: boolean;
  muted?: boolean;
}

function stripMarkdownComments(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function isBlockStart(line: string): boolean {
  return (
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}```/.test(line) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
  );
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = stripMarkdownComments(markdown).split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (/^\s{0,3}```/.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s{0,3}```/.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index] ?? '';
        const match = quoteLine.match(/^\s{0,3}>\s?(.*)$/);
        if (!match) break;
        quoteLines.push(match[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    const firstListItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+?)\s*$/);
    if (firstListItem) {
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const listLine = lines[index] ?? '';
        const match = listLine.match(/^(\s*)([-*+]|\d+[.)])\s+(.+?)\s*$/);
        if (!match) break;
        items.push({
          depth: Math.floor(match[1].length / 2),
          marker: match[2],
          ordered: /^\d/.test(match[2]),
          text: match[3],
        });
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index] ?? '';
      if (!nextLine.trim() || isBlockStart(nextLine)) break;
      paragraphLines.push(nextLine.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*_{}[\]()#+.!-])/g, '$1');
}

function appendPlainText(
  output: React.ReactNode[],
  value: string,
  key: string,
): void {
  if (!value) return;
  output.push(
    <React.Fragment key={key}>{unescapeMarkdown(value)}</React.Fragment>,
  );
}

function renderInline(
  value: string,
  context: InlineContext,
  keyPrefix: string,
): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;
  const tokenPattern =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\n]+\*|_[^_\n]+_)/g;

  for (const match of value.matchAll(tokenPattern)) {
    const start = match.index ?? cursor;
    appendPlainText(
      output,
      value.slice(cursor, start),
      `${keyPrefix}-text-${tokenIndex}`,
    );
    const token = match[0];
    const key = `${keyPrefix}-token-${tokenIndex}`;
    tokenIndex += 1;

    if (token.startsWith('`')) {
      output.push(
        <NativeText
          key={key}
          style={{
            backgroundColor: context.codeBackground,
            color: context.codeColor,
            fontFamily: 'monospace',
          }}
        >
          {token.slice(1, -1)}
        </NativeText>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      output.push(
        <NativeText key={key} style={styles.strong}>
          {renderInline(token.slice(2, -2), context, key)}
        </NativeText>,
      );
    } else if (token.startsWith('~~')) {
      output.push(
        <NativeText key={key} style={styles.strikethrough}>
          {renderInline(token.slice(2, -2), context, key)}
        </NativeText>,
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        output.push(
          <NativeText
            key={key}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(link[2])}
            style={[styles.link, { color: context.linkColor }]}
          >
            {renderInline(link[1], context, key)}
          </NativeText>,
        );
      } else {
        appendPlainText(output, token, key);
      }
    } else if (/^https?:\/\//.test(token)) {
      output.push(
        <NativeText
          key={key}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(token)}
          style={[styles.link, { color: context.linkColor }]}
        >
          {token}
        </NativeText>,
      );
    } else {
      output.push(
        <NativeText key={key} style={styles.emphasis}>
          {renderInline(token.slice(1, -1), context, key)}
        </NativeText>,
      );
    }
    cursor = start + token.length;
  }

  appendPlainText(
    output,
    value.slice(cursor),
    `${keyPrefix}-text-${tokenIndex}`,
  );
  return output;
}

function renderInlineLines(
  lines: string[],
  context: InlineContext,
  keyPrefix: string,
): React.ReactNode[] {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? ['\n'] : []),
    ...renderInline(line, context, `${keyPrefix}-${index}`),
  ]);
}

export function MarkdownText({
  markdown,
  compact = false,
  muted = false,
}: MarkdownTextProps) {
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const linkColor = useThemeColor({}, 'link');
  const borderColor = useThemeColor({}, 'controlBorder');
  const codeBackground = useThemeColor({}, 'backgroundTertiary');
  const bodyColor = muted ? secondaryColor : textColor;
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const context: InlineContext = {
    linkColor,
    codeBackground,
    codeColor: bodyColor,
  };

  return (
    <NativeView style={[styles.container, compact && styles.compactContainer]}>
      {blocks.map((block, blockIndex) => {
        const key = `markdown-block-${blockIndex}`;
        if (block.type === 'heading') {
          return (
            <Text
              key={key}
              style={[
                styles.heading,
                block.level <= 2 ? styles.headingLarge : styles.headingSmall,
                { color: bodyColor },
              ]}
            >
              {renderInline(block.text, context, key)}
            </Text>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <Text key={key} style={[styles.paragraph, { color: bodyColor }]}>
              {renderInlineLines(block.lines, context, key)}
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <NativeView key={key} style={styles.list}>
              {block.items.map((item) => (
                <NativeView
                  key={`${key}-item-${item.depth}-${item.ordered}-${item.text}`}
                  style={[styles.listItem, { marginLeft: item.depth * 14 }]}
                >
                  <Text style={[styles.bullet, { color: secondaryColor }]}>
                    {item.ordered ? item.marker : '•'}
                  </Text>
                  <Text style={[styles.listCopy, { color: bodyColor }]}>
                    {renderInline(
                      item.text,
                      context,
                      `${key}-item-${item.text}`,
                    )}
                  </Text>
                </NativeView>
              ))}
            </NativeView>
          );
        }
        if (block.type === 'quote') {
          return (
            <NativeView
              key={key}
              style={[styles.quote, { borderLeftColor: borderColor }]}
            >
              <Text style={[styles.quoteText, { color: secondaryColor }]}>
                {renderInlineLines(block.lines, context, key)}
              </Text>
            </NativeView>
          );
        }
        if (block.type === 'code') {
          return (
            <NativeView
              key={key}
              style={[styles.codeBlock, { backgroundColor: codeBackground }]}
            >
              <NativeText style={[styles.codeText, { color: bodyColor }]}>
                {block.text}
              </NativeText>
            </NativeView>
          );
        }
        return (
          <NativeView
            key={key}
            style={[styles.rule, { backgroundColor: borderColor }]}
          />
        );
      })}
    </NativeView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  compactContainer: { gap: 6 },
  heading: { fontWeight: '700' },
  headingLarge: { fontSize: 16, lineHeight: 23, marginTop: 4 },
  headingSmall: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  paragraph: { fontSize: 13, lineHeight: 20 },
  list: { gap: 5 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  bullet: { width: 18, fontSize: 13, lineHeight: 20, textAlign: 'right' },
  listCopy: { flex: 1, fontSize: 13, lineHeight: 20 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  quoteText: { fontSize: 13, lineHeight: 20 },
  codeBlock: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  strong: { fontWeight: '700' },
  emphasis: { fontStyle: 'italic' },
  strikethrough: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
