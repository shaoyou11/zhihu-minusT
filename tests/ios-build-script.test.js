const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('unsigned iOS build script', () => {
  let directory;
  let binDirectory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhihu-ipa-test-'));
    binDirectory = path.join(directory, 'bin');
    fs.mkdirSync(binDirectory);
    fs.mkdirSync(path.join(directory, 'ios', 'ReviewFixture.xcworkspace'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'build-unsigned-ipa.sh'),
      path.join(directory, 'scripts', 'build-unsigned-ipa.sh'),
    );
    fs.copyFileSync(
      path.join(__dirname, '..', 'scripts', 'strip-ios-app.py'),
      path.join(directory, 'scripts', 'strip-ios-app.py'),
    );
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"version":"1.2.3"}',
    );
    for (const [name, body] of Object.entries({
      npx: `echo "prebuild $*" >> "$IPA_TEST_TRACE"
if [[ " $* " == *" --clean "* ]]; then
  rm -rf ios
  mkdir -p ios/ReviewFixture.xcworkspace
  if [ "\${IPA_TEST_MULTIPLE_WORKSPACES:-0}" = 1 ]; then
    mkdir -p ios/Other.xcworkspace
  fi
fi
exit "\${IPA_TEST_PREBUILD_EXIT:-0}"`,
      pod: `echo "pods $*" >> "$IPA_TEST_TRACE"\nexit "\${IPA_TEST_POD_EXIT:-0}"`,
      python3: `echo "strip $*" >> "$IPA_TEST_TRACE"
test "$1" = "$PWD/scripts/strip-ios-app.py"
test -f "$2/ReviewFixture"
if [ "\${IPA_TEST_STRIP_EXIT:-0}" != 0 ]; then
  exit "$IPA_TEST_STRIP_EXIT"
fi
echo stripped > "$2/ReviewFixture"`,
      xcodebuild: `echo "xcode $*" >> "$IPA_TEST_TRACE"
echo "sentry-upload=\${SENTRY_DISABLE_AUTO_UPLOAD:-unset} no-upload=\${SENTRY_NO_UPLOAD:-unset} allow-failure=\${SENTRY_ALLOW_FAILURE:-unset} release=\${SENTRY_RELEASE:-unset} dist=\${SENTRY_DIST:-unset} args=\${SENTRY_CLI_RN_XCODE_EXTRA_ARGS:-}" >> "$IPA_TEST_TRACE"
mkdir -p build/Release-iphoneos/ReviewFixture.app
echo binary > build/Release-iphoneos/ReviewFixture.app/ReviewFixture
if [ "\${IPA_TEST_MULTIPLE_APPS:-0}" = 1 ]; then
  mkdir -p build/Release-iphoneos/Other.app
fi`,
    })) {
      const filename = path.join(binDirectory, name);
      fs.writeFileSync(filename, `#!/bin/bash\nset -eu\n${body}\n`, {
        mode: 0o755,
      });
    }
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function run(extraEnv = {}) {
    return spawnSync(
      'bash',
      [path.join(directory, 'scripts', 'build-unsigned-ipa.sh')],
      {
        cwd: binDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
          IPA_TEST_TRACE: path.join(directory, 'trace.txt'),
          SENTRY_AUTH_TOKEN: '',
          SENTRY_DISABLE_AUTO_UPLOAD: '',
          SENTRY_NO_UPLOAD: '',
          SENTRY_ALLOW_FAILURE: '',
          SENTRY_RELEASE: '',
          SENTRY_DIST: '',
          SENTRY_CLI_RN_XCODE_EXTRA_ARGS: '',
          ...extraEnv,
        },
      },
    );
  }

  test('refreshes existing native code and preserves other artifacts and local Xcode settings', () => {
    const oldIpa = path.join(
      directory,
      'zhihu-minus-minus-v1.0.0-unsigned.ipa',
    );
    const localEnv = path.join(directory, 'ios', '.xcode.env.local');
    fs.writeFileSync(oldIpa, 'previous build');
    fs.writeFileSync(localEnv, '# user settings\n', { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'ios', 'old-native-file'), 'stale');
    fs.mkdirSync(path.join(directory, 'Payload'));
    fs.writeFileSync(path.join(directory, 'Payload', 'user-file'), 'keep');

    const result = run();
    expect(result.status).toBe(0);
    const trace = fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8');
    expect(trace).toContain(
      'prebuild expo prebuild --clean --platform ios --no-install',
    );
    expect(trace).toContain('pods install');
    expect(trace).toContain(
      '-workspace ios/ReviewFixture.xcworkspace -scheme ReviewFixture',
    );
    expect(fs.readFileSync(oldIpa, 'utf8')).toBe('previous build');
    expect(fs.readFileSync(localEnv, 'utf8')).toBe('# user settings\n');
    expect(fs.statSync(localEnv).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(directory, 'ios', 'old-native-file'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(directory, 'Payload', 'user-file'))).toBe(
      true,
    );
    const ipa = path.join(directory, 'zhihu-minus-minus-v1.2.3-unsigned.ipa');
    const entries = spawnSync('unzip', ['-Z1', ipa], { encoding: 'utf8' });
    expect(entries.status).toBe(0);
    expect(entries.stdout).toContain('Payload/ReviewFixture.app/ReviewFixture');
    expect(trace).toContain('/Payload/ReviewFixture.app');
    expect(
      spawnSync(
        'unzip',
        ['-p', ipa, 'Payload/ReviewFixture.app/ReviewFixture'],
        {
          encoding: 'utf8',
        },
      ).stdout,
    ).toBe('stripped\n');
    expect(
      fs.readFileSync(
        path.join(
          directory,
          'build',
          'Release-iphoneos',
          'ReviewFixture.app',
          'ReviewFixture',
        ),
        'utf8',
      ),
    ).toBe('binary\n');
    expect(fs.readdirSync(path.join(directory, 'build'))).toEqual([
      'Release-iphoneos',
    ]);
  });

  test('restores local Xcode settings if clean prebuild fails', () => {
    const localEnv = path.join(directory, 'ios', '.xcode.env.local');
    fs.writeFileSync(localEnv, '# user settings\n');

    expect(run({ IPA_TEST_PREBUILD_EXIT: '1' }).status).not.toBe(0);
    expect(fs.readFileSync(localEnv, 'utf8')).toBe('# user settings\n');
    const trace = fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8');
    expect(trace).not.toContain('pods install');
    expect(trace).not.toContain('xcode ');
  });

  test('never restores an incomplete backup when the initial copy fails', () => {
    const localEnv = path.join(directory, 'ios', '.xcode.env.local');
    fs.writeFileSync(localEnv, '# complete user settings\n', { mode: 0o600 });
    fs.writeFileSync(
      path.join(binDirectory, 'cp'),
      `#!/bin/bash
set -eu
if [ "$2" = "ios/.xcode.env.local" ]; then
  printf partial > "$3"
  exit 1
fi
exec /bin/cp "$@"
`,
      { mode: 0o755 },
    );

    expect(run({ TMPDIR: directory }).status).not.toBe(0);
    expect(fs.readFileSync(localEnv, 'utf8')).toBe(
      '# complete user settings\n',
    );
    expect(fs.statSync(localEnv).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(directory, 'trace.txt'))).toBe(false);
    expect(
      fs
        .readdirSync(directory)
        .some((name) => name.startsWith('zhihu-ios-build.')),
    ).toBe(false);
  });

  test('stops before compiling when Pods installation fails', () => {
    expect(run({ IPA_TEST_POD_EXIT: '1' }).status).not.toBe(0);
    expect(
      fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8'),
    ).not.toContain('xcode ');
  });

  test('keeps the previous same-version IPA when stripping fails', () => {
    const ipa = path.join(directory, 'zhihu-minus-minus-v1.2.3-unsigned.ipa');
    fs.writeFileSync(ipa, 'previous same-version build');

    expect(run({ IPA_TEST_STRIP_EXIT: '1' }).status).not.toBe(0);
    expect(fs.readFileSync(ipa, 'utf8')).toBe('previous same-version build');
    expect(fs.readdirSync(path.join(directory, 'build'))).toEqual([
      'Release-iphoneos',
    ]);
  });

  test('keeps builds without upload credentials offline', () => {
    expect(run().status).toBe(0);
    expect(
      fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8'),
    ).toContain('sentry-upload=true no-upload=1');
  });

  test('uploads with credentials and waits for processing without allowing failures', () => {
    const result = run({
      SENTRY_AUTH_TOKEN: 'synthetic-upload-token',
      SENTRY_ALLOW_FAILURE: 'true',
      SENTRY_RELEASE: 'synthetic-override',
      SENTRY_DIST: 'synthetic-override',
    });
    expect(result.status).toBe(0);
    const trace = fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8');
    expect(trace).toContain(
      'sentry-upload=false no-upload=unset allow-failure=false release=unset dist=unset',
    );
    expect(trace).toContain('--force-foreground --wait');
    expect(`${result.stdout}${result.stderr}${trace}`).not.toContain(
      'synthetic-upload-token',
    );
  });

  test.each([
    { SENTRY_DISABLE_AUTO_UPLOAD: 'true' },
    { SENTRY_NO_UPLOAD: '1' },
    { SENTRY_NO_UPLOAD: 'true' },
  ])('preserves an explicit upload opt-out: %s', (skipEnv) => {
    expect(
      run({ SENTRY_AUTH_TOKEN: 'synthetic-upload-token', ...skipEnv }).status,
    ).toBe(0);
    expect(
      fs.readFileSync(path.join(directory, 'trace.txt'), 'utf8'),
    ).toContain('sentry-upload=true no-upload=1');
  });

  test('rejects ambiguous workspaces or built apps', () => {
    expect(run({ IPA_TEST_MULTIPLE_WORKSPACES: '1' }).status).not.toBe(0);
    expect(run({ IPA_TEST_MULTIPLE_APPS: '1' }).status).not.toBe(0);
    expect(
      fs.existsSync(
        path.join(directory, 'zhihu-minus-minus-v1.2.3-unsigned.ipa'),
      ),
    ).toBe(false);
  });
});
