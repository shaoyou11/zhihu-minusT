const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('unsigned IPA stripping preserves runtime metadata and fails closed', () => {
  const result = spawnSync(
    'python3',
    [path.join(__dirname, 'native', 'strip_ios_app_test.py')],
    { encoding: 'utf8' },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toContain('OK');
  expect(result.status).toBe(0);
});
