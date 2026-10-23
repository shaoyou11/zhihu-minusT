import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('katex/package.json');
const directory = path.dirname(packagePath);

const { version } = JSON.parse(await readFile(packagePath, 'utf8'));
let css = await readFile(path.join(directory, 'dist/katex.min.css'), 'utf8');
// Both supported native WebViews implement WOFF2. Keep one source per face so
// no font request escapes the packaged document and no unused formats inflate it.
for (const source of css.matchAll(/src:([^;]+);/g)) {
  const name = /url\(fonts\/([^)]*\.woff2)\)/.exec(source[1])?.[1];
  if (!name || path.basename(name) !== name)
    throw new Error('Unexpected KaTeX font source');
  const font = await readFile(path.join(directory, 'dist/fonts', name));
  css = css.replace(
    source[0],
    `src:url(data:font/woff2;base64,${font.toString('base64')}) format("woff2");`,
  );
}
if (/url\((?!data:)/.test(css)) throw new Error('External KaTeX resource');
const style = {
  version,
  license: await readFile(path.join(directory, 'LICENSE'), 'utf8'),
  css,
};
const runtime = {
  version,
  script: await readFile(path.join(directory, 'dist/katex.min.js'), 'utf8'),
  autoRender: await readFile(
    path.join(directory, 'dist/contrib/auto-render.min.js'),
    'utf8',
  ),
};
let bytes = 0;
for (const [name, resources] of [
  ['katex-style', style],
  ['katex-runtime', runtime],
]) {
  const destination = fileURLToPath(
    new URL(`../assets/${name}.json`, import.meta.url),
  );
  const output = `${JSON.stringify(resources, null, 2)}\n`;
  bytes += Buffer.byteLength(output);
  if (process.argv.includes('--check')) {
    if ((await readFile(destination, 'utf8')) !== output)
      throw new Error(
        'Packaged KaTeX is stale; run npm run generate:rich-content:katex',
      );
  } else await writeFile(destination, output);
}
console.log(
  `KaTeX ${version}: ${bytes} packaged bytes (offline JS, CSS and WOFF2)`,
);
