import { readFileSync } from 'node:fs';
import path from 'node:path';
import { compileZhihuDocument } from '../compileRichText';
import { flowLayoutIdentity, flowMetricStyles } from '../flowLayout';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import type { RichTextFlow, RichTextSpan } from '../richText';
import { legacyMetricStyles } from './flow-layout-reference';

function denseFlows(): RichTextFlow[] {
  const fixture = JSON.parse(
    readFileSync(
      path.join(__dirname, '../fixtures/cases/dense-metric-spans-001.json'),
      'utf8',
    ),
  );
  return compileZhihuDocument(
    normalizeZhihuDocument(fixture.content, { documentId: fixture.id })
      .document,
    { fontSize: 17, lineHeight: 25.5 },
  ).parts.flatMap((part) => (part.type === 'flow' ? [part.flow] : []));
}

test('sweep output is identical for dense overlapping metric spans and layout identity ignores paint', () => {
  const flows = denseFlows();
  expect(flows.flatMap((flow) => flow.spans).length).toBeGreaterThan(8192);
  for (const flow of flows) {
    expect(flowMetricStyles(flow)).toEqual(legacyMetricStyles(flow));
    const painted = {
      ...flow,
      decorations: [],
      spans: flow.spans.map((span) => ({
        ...span,
        color: '#123456',
        nodeId: 'paint-only',
      })),
    };
    expect(flowLayoutIdentity(painted)).toBe(flowLayoutIdentity(flow));
    expect(flowLayoutIdentity({ ...flow, text: `${flow.text}x` })).not.toBe(
      flowLayoutIdentity(flow),
    );
  }
});

test('sweep preserves original order, duplicate kinds, adjacent runs and empty spans', () => {
  let seed = 1245;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const kinds = [
    'strong',
    'code',
    'emphasis',
    'superscript',
    'subscript',
    'link',
  ] as const;
  for (let trial = 0; trial < 200; trial++) {
    const spans: RichTextSpan[] = Array.from({ length: 50 }, (_, index) => {
      const start = Math.floor(random() * 100);
      return {
        start,
        end: start + Math.floor(random() * 40),
        nodeId: String(index),
        kind: kinds[Math.floor(random() * kinds.length)],
      };
    });
    expect(flowMetricStyles({ spans })).toEqual(legacyMetricStyles({ spans }));
  }
  expect(flowMetricStyles({ spans: [] })).toEqual([]);
});
