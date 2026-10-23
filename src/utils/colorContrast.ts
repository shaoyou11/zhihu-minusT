/** Contrast helpers for opaque app UI colors (sRGB). */
export function rgbChannels(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex)
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    ) as [number, number, number];
  throw new Error('Invalid opaque theme color');
}

/** Use the current surface hue for overlays instead of hardcoded white/black. */
export function withAlpha(color: string, alpha: number): string {
  const channels = rgbChannels(color);
  const opacity = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  return `rgba(${channels.join(',')},${opacity})`;
}

function luminance(color: string): number {
  const channels = rgbChannels(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function contrastingText(background: string): string {
  return contrastRatio('#000000', background) >=
    contrastRatio('#ffffff', background)
    ? '#000000'
    : '#ffffff';
}

/** Keep the chosen hue when possible; move toward black/white until readable. */
export function readableColor(
  foreground: string,
  backgrounds: readonly string[],
  minimum = 4.5,
): string {
  const fits = (candidate: string) =>
    backgrounds.every(
      (background) => contrastRatio(candidate, background) >= minimum,
    );
  if (fits(foreground)) return foreground;
  const target = ['#000000', '#ffffff'].sort(
    (a, b) =>
      Math.min(
        ...backgrounds.map((background) => contrastRatio(b, background)),
      ) -
      Math.min(
        ...backgrounds.map((background) => contrastRatio(a, background)),
      ),
  )[0];
  const source = rgbChannels(foreground);
  const destination = rgbChannels(target);
  for (let step = 1; step <= 100; step += 1) {
    const candidate = `#${source
      .map((value, index) =>
        Math.round(value + ((destination[index] - value) * step) / 100)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
    if (fits(candidate)) return candidate;
  }
  return target;
}
