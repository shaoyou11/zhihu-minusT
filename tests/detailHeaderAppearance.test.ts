import { calculateDetailHeaderAppearance } from '../src/utils/detailHeaderAppearance';

describe('detail header appearance', () => {
  it.each([
    [-20, 0],
    [0, 0],
    [80, 1],
    [160, 1],
  ])(
    'keeps offset %s within the expanded and collapsed visibility limits',
    (offset, expected) => {
      expect(calculateDetailHeaderAppearance(offset, 80)).toBeCloseTo(expected);
    },
  );

  it('uses the measured content boundary for a taller answer introduction', () => {
    expect(calculateDetailHeaderAppearance(0, 140)).toBe(0);
    expect(calculateDetailHeaderAppearance(140, 140)).toBe(1);
  });

  it('normalizes a short introduction from the top to its collapse boundary', () => {
    expect(calculateDetailHeaderAppearance(0, 32)).toBe(0);
    expect(calculateDetailHeaderAppearance(32, 32)).toBe(1);
  });
});
