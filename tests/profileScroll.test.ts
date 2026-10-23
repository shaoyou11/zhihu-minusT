import {
  getProfileCoverState,
  getProfileHeaderOffset,
  getProfileMinContentHeight,
  getProfileResizedOffset,
  getProfileSyncedOffset,
  PROFILE_COVER_SCROLL_DISTANCE,
} from '../src/utils/profileScroll';

describe('profile cover collapse', () => {
  test('keeps cover movement within its reserved space and ignores invalid offsets', () => {
    for (const offset of [0, 56, 900]) {
      const { translateY } = getProfileCoverState(offset);
      expect(translateY).toBeLessThanOrEqual(0);
      expect(translateY).toBeGreaterThanOrEqual(-PROFILE_COVER_SCROLL_DISTANCE);
    }
    for (const offset of [-80, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getProfileCoverState(offset).translateY).toBe(0);
    }
  });
});

describe('profile tab scroll coordination', () => {
  test('re-expands a previously scrolled tab to the current visible header', () => {
    expect(getProfileSyncedOffset(0, 900, 320)).toBe(0);
    expect(getProfileSyncedOffset(120, 900, 320)).toBe(120);
    expect(getProfileSyncedOffset(120, 20, 320)).toBe(120);
  });

  test('preserves independent reading positions while the header is collapsed', () => {
    expect(getProfileSyncedOffset(800, 650, 320)).toBe(650);
    expect(getProfileSyncedOffset(320, 0, 320)).toBe(320);
    expect(getProfileSyncedOffset(800, 120, 320)).toBe(320);
  });

  test('does not copy pull-to-refresh overscroll into another tab', () => {
    expect(getProfileSyncedOffset(-80, 600, 320)).toBe(0);
    expect(getProfileHeaderOffset([-80, 160], 0, 320)).toBe(0);
    expect(getProfileHeaderOffset([-80, 160], 0.5, 320)).toBe(80);
  });

  test('interpolates clamped headers instead of deep list reading positions', () => {
    expect(getProfileHeaderOffset([900, 0], 0.5, 320)).toBe(160);
    expect(getProfileHeaderOffset([900, 0], 0.75, 320)).toBe(80);
    expect(getProfileHeaderOffset([900, 700], 0.5, 320)).toBe(320);
    expect(getProfileHeaderOffset([0, 160, 320], 1.5, 320)).toBe(240);
  });

  test('keeps horizontal overscroll within the first and final headers', () => {
    expect(getProfileHeaderOffset([80, 240], -0.2, 320)).toBe(80);
    expect(getProfileHeaderOffset([80, 240], 1.2, 320)).toBe(240);
    expect(getProfileHeaderOffset([], 0, 320)).toBe(0);
  });

  test('gives empty portrait and landscape pages the full collapse range', () => {
    expect(getProfileMinContentHeight(720, 320) - 720).toBe(320);
    expect(getProfileMinContentHeight(300, 180) - 300).toBe(180);
    expect(getProfileMinContentHeight(720, 0)).toBe(720);
  });

  test('resizes partially expanded headers while preserving the expansion ratio', () => {
    expect(getProfileResizedOffset(0, 320, 480)).toBe(0);
    expect(getProfileResizedOffset(160, 320, 480)).toBe(240);
    expect(getProfileResizedOffset(240, 480, 320)).toBe(160);
  });

  test('keeps the same content position after a collapsed header resizes', () => {
    expect(getProfileResizedOffset(320, 320, 480)).toBe(480);
    expect(getProfileResizedOffset(820, 320, 480)).toBe(980);
    expect(getProfileResizedOffset(820, 320, 180)).toBe(680);
  });

  test('handles the initial unmeasured header and removal of collapse space', () => {
    expect(getProfileResizedOffset(0, 0, 320)).toBe(0);
    expect(getProfileResizedOffset(50, 0, 320)).toBe(370);
    expect(getProfileResizedOffset(160, 320, 0)).toBe(0);
    expect(getProfileResizedOffset(500, 320, 0)).toBe(180);
    expect(getProfileSyncedOffset(0, 500, 0)).toBe(500);
  });

  test('does not feed invalid measurements into native scrolling or transforms', () => {
    expect(getProfileSyncedOffset(Number.NaN, 900, 320)).toBe(0);
    expect(getProfileHeaderOffset([Number.NaN], Number.NaN, 320)).toBe(0);
    expect(getProfileHeaderOffset([80], 0, -1)).toBe(0);
    expect(getProfileMinContentHeight(Number.NaN, -1)).toBe(0);
    expect(getProfileResizedOffset(-80, 320, 480)).toBe(0);
  });
});
