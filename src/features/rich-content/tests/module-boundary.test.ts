import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = path.resolve(__dirname, '../../../');
const COMPATIBILITY_FILES = new Set([
  path.join(SOURCE_ROOT, 'components/ZhihuContent.tsx'),
  path.join(SOURCE_ROOT, 'components/ZhihuDOMContent.tsx'),
]);
const LEGACY_IMPORT_PATTERN =
  /from\s+['"](?:@\/components\/ZhihuContent|\.\/ZhihuContent)['"]/;

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(entryPath);
      return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nestedFiles.flat();
}

test('application code imports rich content through the feature entry point', async () => {
  const sourceFiles = (
    await Promise.all(
      ['app', 'components'].map((directory) =>
        listSourceFiles(path.join(SOURCE_ROOT, directory)),
      ),
    )
  )
    .flat()
    .filter((filePath) => !COMPATIBILITY_FILES.has(filePath));

  const violations = [];
  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    if (LEGACY_IMPORT_PATTERN.test(source)) {
      violations.push(path.relative(SOURCE_ROOT, filePath));
    }
  }

  assert.deepEqual(violations, []);
});
