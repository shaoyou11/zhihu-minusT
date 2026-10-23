import { calculateScrollIndicatorGeometry } from '../src/utils/scrollIndicator';

describe('reading scroll indicator geometry', () => {
  it.each([0, 300, 500])(
    'hides content of height %s that fits in the viewport',
    (contentHeight) => {
      expect(
        calculateScrollIndicatorGeometry(0, contentHeight, 500, 400),
      ).toEqual({ visible: false, thumbHeight: 0, thumbOffset: 0 });
    },
  );

  it('uses the full viewport for the thumb ratio and the inset track for travel', () => {
    expect(calculateScrollIndicatorGeometry(0, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 0,
    });
    expect(calculateScrollIndicatorGeometry(750, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 150,
    });
    expect(calculateScrollIndicatorGeometry(1500, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 300,
    });
  });

  it('clamps both ends during elastic overscroll', () => {
    const top = calculateScrollIndicatorGeometry(-120, 2000, 500, 400);
    const bottom = calculateScrollIndicatorGeometry(1750, 2000, 500, 400);
    expect(top.thumbOffset).toBe(0);
    expect(bottom.thumbOffset + bottom.thumbHeight).toBe(400);
  });

  it('keeps a long-content thumb legible without overflowing a tiny track', () => {
    expect(
      calculateScrollIndicatorGeometry(4500, 10000, 500, 400).thumbHeight,
    ).toBe(28);
    expect(calculateScrollIndicatorGeometry(9500, 10000, 500, 18)).toEqual({
      visible: true,
      thumbHeight: 18,
      thumbOffset: 0,
    });
  });

  it.each([
    [Number.NaN, 2000, 500, 400],
    [0, Number.POSITIVE_INFINITY, 500, 400],
    [0, 2000, Number.NaN, 400],
    [0, 2000, 0, 400],
    [0, 2000, -100, 400],
    [0, 2000, 500, Number.POSITIVE_INFINITY],
    [0, 2000, 500, 0],
    [0, 2000, 500, -100],
  ])('hides invalid measurements (%s, %s, %s, %s)', (...measurements) => {
    expect(calculateScrollIndicatorGeometry(...measurements)).toEqual({
      visible: false,
      thumbHeight: 0,
      thumbOffset: 0,
    });
  });
});
