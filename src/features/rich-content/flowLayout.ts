import type { RichTextFlow } from './richText';

const metricKinds = new Set([
  'strong',
  'emphasis',
  'subscript',
  'superscript',
  'code',
]);

export interface MetricStyle {
  start: number;
  end: number;
  kinds: string[];
}

/** Sweep span endpoints; enumerate only active leaves in original span order. */
export function flowMetricStyles(
  flow: Pick<RichTextFlow, 'spans'>,
): MetricStyle[] {
  const spans = flow.spans.filter((span) => metricKinds.has(span.kind));
  const events = new Map<number, { starts: number[]; ends: number[] }>();
  spans.forEach((span, index) => {
    for (const [offset, type] of [
      [span.start, 'starts'],
      [span.end, 'ends'],
    ] as const) {
      let event = events.get(offset);
      if (!event) {
        event = { starts: [], ends: [] };
        events.set(offset, event);
      }
      event[type].push(index);
    }
  });
  const boundaries = [...events.keys()].sort((a, b) => a - b);
  let size = 1;
  while (size < spans.length) size *= 2;
  const tree = new Uint32Array(size * 2);
  const update = (index: number, active: number) => {
    let node = size + index;
    tree[node] = active;
    while (node > 1) {
      node >>= 1;
      tree[node] = tree[node * 2] + tree[node * 2 + 1];
    }
  };
  const kindsAt = (node: number, kinds: string[]) => {
    if (!tree[node]) return;
    if (node >= size) {
      kinds.push(spans[node - size].kind);
      return;
    }
    kindsAt(node * 2, kinds);
    kindsAt(node * 2 + 1, kinds);
  };
  const styles: MetricStyle[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const event = events.get(start);
    if (!event) continue;
    // Empty ranges never cover an interval. End before start permits adjacent runs.
    for (const span of event.ends) update(span, 0);
    for (const span of event.starts)
      if (spans[span].end > start) update(span, 1);
    if (!tree[1]) continue;
    const kinds: string[] = [];
    kindsAt(1, kinds);
    const previous = styles[styles.length - 1];
    if (
      previous?.end === start &&
      previous.kinds.length === kinds.length &&
      previous.kinds.every((kind, position) => kind === kinds[position])
    )
      previous.end = end;
    else styles.push({ start, end, kinds });
  }
  return styles;
}

/** Paint/actions may change without changing the native text's measured size. */
export function flowLayoutIdentity(flow: RichTextFlow): string {
  const styles = flowMetricStyles(flow);
  return JSON.stringify({
    text: flow.text,
    paragraphs: flow.paragraphs.map((paragraph) => ({
      start: paragraph.start,
      end: paragraph.end,
      kind: paragraph.kind,
      level: paragraph.level,
      fontSize: paragraph.fontSize,
      lineHeight: paragraph.lineHeight,
      indent: paragraph.indent,
      marginTop: paragraph.marginTop,
      marginBottom: paragraph.marginBottom,
    })),
    styles,
    attachments: flow.attachments.map((attachment) => ({
      start: attachment.start,
      end: attachment.end,
      kind: attachment.kind,
      url: attachment.url,
      latex: attachment.latex,
      width: attachment.width,
      height: attachment.height,
      baselineOffset: attachment.baselineOffset,
    })),
  });
}
