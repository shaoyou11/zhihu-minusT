import { execFileSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import katexRuntime from '../assets/katex-runtime.json';
import katexStyle from '../assets/katex-style.json';

interface OfflineKaTeX {
  version: string;
  renderToString: (
    formula: string,
    options: { throwOnError: boolean },
  ) => string;
}

test('packaged KaTeX is reproducible from the installed locked dependency', () => {
  expect(katexStyle.version).toBe(require('katex/package.json').version);
  expect(katexRuntime.version).toBe(katexStyle.version);
  expect(() =>
    execFileSync(
      process.execPath,
      [path.join(__dirname, '../tools/bundle-katex.mjs'), '--check'],
      { stdio: 'pipe' },
    ),
  ).not.toThrow();
});

test('offline scripts render formulas and all font faces resolve to packaged data', () => {
  const context = vm.createContext({});
  vm.runInContext(katexRuntime.script, context);
  vm.runInContext(katexRuntime.autoRender, context);
  const renderer = context.katex as OfflineKaTeX;
  expect(renderer.version).toBe(katexStyle.version);
  expect(
    renderer.renderToString('\\frac{a^2}{b} + \\sqrt{x}', {
      throwOnError: false,
    }),
  ).toContain('class="mfrac"');
  expect(typeof context.renderMathInElement).toBe('function');
  const fonts = [...katexStyle.css.matchAll(/url\(([^)]+)\)/g)];
  expect(fonts).toHaveLength(20);
  for (const font of fonts)
    expect(font[1]).toMatch(/^data:font\/woff2;base64,[A-Za-z0-9+/]+=*$/);
  expect(katexStyle.license).toContain('MIT License');
});
