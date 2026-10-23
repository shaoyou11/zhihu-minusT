import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const { APP_ICONS } = require('../plugins/app-icon.config.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'src/assets/images/app-icons');
const size = 1024;
// Android guarantees that only the centered 66x66 area of a 108x108
// adaptive-icon layer survives every OEM mask: (108 - 66) / 2 = 21.
const androidAdaptiveSafeInset = 21 / 108;

function parseHex(hex) {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function mixColor(left, right, amount) {
  return {
    r: Math.round(left.r + (right.r - left.r) * amount),
    g: Math.round(left.g + (right.g - left.g) * amount),
    b: Math.round(left.b + (right.b - left.b) * amount),
    a: 255,
  };
}

function positionInDirection(pattern, x, y) {
  const [startX, startY] = pattern.start;
  const [endX, endY] = pattern.end;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  return Math.max(
    0,
    Math.min(
      1,
      ((x - startX) * deltaX + (y - startY) * deltaY) /
        (deltaX * deltaX + deltaY * deltaY),
    ),
  );
}

function colorAtPosition(icon, x, y) {
  if (icon.bands) {
    const progress = positionInDirection(icon.bands, x, y);
    const index = Math.min(
      Math.floor(progress * icon.bands.colors.length),
      icon.bands.colors.length - 1,
    );
    return parseHex(icon.bands.colors[index]);
  }
  if (!icon.gradient) return parseHex(icon.color);
  const progress = positionInDirection(icon.gradient, x, y);
  const colors = icon.gradient.colors.map(parseHex);
  const scaled = progress * (colors.length - 1);
  const leftIndex = Math.min(Math.floor(scaled), colors.length - 2);
  return mixColor(colors[leftIndex], colors[leftIndex + 1], scaled - leftIndex);
}

function paintPixel(image, x, y, color) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color.r;
  image.data[offset + 1] = color.g;
  image.data[offset + 2] = color.b;
  image.data[offset + 3] = color.a;
}

function paintRoundedRect(image, x, y, width, height, radius, color) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  radius = Math.round(radius);
  const right = x + width - 1;
  const bottom = y + height - 1;
  for (let pixelY = y; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = x; pixelX <= right; pixelX += 1) {
      const closestX = Math.max(x + radius, Math.min(pixelX, right - radius));
      const closestY = Math.max(y + radius, Math.min(pixelY, bottom - radius));
      const deltaX = pixelX - closestX;
      const deltaY = pixelY - closestY;
      if (deltaX * deltaX + deltaY * deltaY <= radius * radius) {
        paintPixel(image, pixelX, pixelY, color);
      }
    }
  }
}

function makeBackground(icon, safeInset = 0) {
  const image = new PNG({ width: size, height: size, colorType: 2 });
  const safeSize = 1 - safeInset * 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const safeX = (x / size - safeInset) / safeSize;
      const safeY = (y / size - safeInset) / safeSize;
      paintPixel(image, x, y, colorAtPosition(icon, safeX, safeY));
    }
  }

  return image;
}

function makeIcon(icon) {
  const image = makeBackground(icon);
  const white = { r: 255, g: 255, b: 255, a: 255 };

  const scale = size / 192;
  paintRoundedRect(
    image,
    48 * scale,
    86 * scale,
    40 * scale,
    12 * scale,
    6 * scale,
    white,
  );
  paintRoundedRect(
    image,
    104 * scale,
    86 * scale,
    40 * scale,
    12 * scale,
    6 * scale,
    white,
  );
  return PNG.sync.write(image, { colorType: 2 });
}

function makeSvg(icon) {
  let background;
  if (icon.gradient) {
    background = `<defs>
    <linearGradient id="background" x1="${icon.gradient.start[0]}" y1="${icon.gradient.start[1]}" x2="${icon.gradient.end[0]}" y2="${icon.gradient.end[1]}">
${icon.gradient.colors
  .map(
    (color, index) =>
      `      <stop offset="${index / (icon.gradient.colors.length - 1)}" stop-color="${color}"/>`,
  )
  .join('\n')}
    </linearGradient>
  </defs>
  <rect width="192" height="192" fill="url(#background)"/>`;
  } else if (icon.bands) {
    const stops = icon.bands.colors.flatMap((color, index, colors) => {
      const start = index / colors.length;
      const end = (index + 1) / colors.length;
      return [
        `      <stop offset="${start}" stop-color="${color}"/>`,
        `      <stop offset="${end}" stop-color="${color}"/>`,
      ];
    });
    background = `<defs>
    <linearGradient id="background" x1="${icon.bands.start[0]}" y1="${icon.bands.start[1]}" x2="${icon.bands.end[0]}" y2="${icon.bands.end[1]}">
${stops.join('\n')}
    </linearGradient>
  </defs>
  <rect width="192" height="192" fill="url(#background)"/>`;
  } else {
    background = `<rect width="192" height="192" fill="${icon.color}"/>`;
  }
  return `<svg width="1024" height="1024" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${background}
  <rect x="48" y="86" width="40" height="12" rx="6" fill="white"/>
  <rect x="104" y="86" width="40" height="12" rx="6" fill="white"/>
</svg>
`;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  APP_ICONS.map(async (icon) => {
    const writes = [
      writeFile(path.join(outputDirectory, `${icon.id}.png`), makeIcon(icon)),
      writeFile(path.join(outputDirectory, `${icon.id}.svg`), makeSvg(icon)),
    ];
    if (icon.gradient || icon.bands) {
      writes.push(
        writeFile(
          path.join(outputDirectory, `${icon.id}-background.png`),
          PNG.sync.write(makeBackground(icon, androidAdaptiveSafeInset), {
            colorType: 2,
          }),
        ),
      );
    }
    await Promise.all(writes);
  }),
);

console.log(
  `Generated ${APP_ICONS.length} app icon variants in ${outputDirectory}`,
);
