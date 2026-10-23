import type { MetricStyle } from '../flowLayout';
import type { RichTextFlow } from '../richText';

/** Previous implementation retained only as the output compatibility oracle. */
export function legacyMetricStyles(
  flow: Pick<RichTextFlow, 'spans'>,
): MetricStyle[] {
  const spans = flow.spans.filter((span) =>
    ['strong', 'emphasis', 'subscript', 'superscript', 'code'].includes(
      span.kind,
    ),
  );
  const boundaries = [
    ...new Set(spans.flatMap((span) => [span.start, span.end])),
  ].sort((a, b) => a - b);
  const styles: MetricStyle[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const kinds = spans
      .filter((span) => span.start <= start && span.end >= end)
      .map((span) => span.kind);
    if (!kinds.length) continue;
    const previous = styles.at(-1);
    if (previous?.end === start && previous.kinds.join(',') === kinds.join(','))
      previous.end = end;
    else styles.push({ start, end, kinds });
  }
  return styles;
}
