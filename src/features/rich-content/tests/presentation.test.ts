import assert from 'node:assert/strict';
import { createRichContentMetrics } from '../presentation';

test('keeps rich content typography and appearance scales on one metrics source', () => {
  const baseMetrics = createRichContentMetrics(1, 1);
  const fontSizeScale = 1.2;
  const lineHeightScale = 1.7;
  const metrics = createRichContentMetrics(fontSizeScale, lineHeightScale);

  assert.ok(
    Math.abs(metrics.codeFontSize / baseMetrics.codeFontSize - fontSizeScale) <
      1e-10,
  );

  const textMetrics = [metrics.body, ...Object.values(metrics.headings)];
  const baseTextMetrics = [
    baseMetrics.body,
    ...Object.values(baseMetrics.headings),
  ];
  for (const [index, text] of textMetrics.entries()) {
    const base = baseTextMetrics[index];
    assert.ok(Math.abs(text.fontSize / base.fontSize - fontSizeScale) < 1e-10);
    assert.ok(
      Math.abs(
        text.lineHeight / base.lineHeight - fontSizeScale * lineHeightScale,
      ) < 1e-10,
    );
    assert.ok(
      Math.abs(
        text.lineHeight / text.fontSize / (base.lineHeight / base.fontSize) -
          lineHeightScale,
      ) < 1e-10,
    );
  }
});
