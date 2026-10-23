jest.mock('@expo/config-plugins', () => ({
  withGradleProperties: (config, action) => action(config),
}));

const withAndroidBuildMemory = require('../plugins/withAndroidBuildMemory');

function apply(properties) {
  return withAndroidBuildMemory({ modResults: properties }).modResults;
}

function property(key, value) {
  return { type: 'property', key, value };
}

test('replaces template memory defaults while preserving unrelated build settings', () => {
  const unrelated = [
    { type: 'comment', value: 'Keep native build options' },
    property('reactNativeArchitectures', 'armeabi-v7a,arm64-v8a,x86,x86_64'),
    property('android.enableMinifyInReleaseBuilds', 'true'),
    property('expo.useLegacyPackaging', 'true'),
  ];
  const result = apply([
    property('org.gradle.jvmargs', '-Xmx2048m -XX:MaxMetaspaceSize=512m'),
    property('org.gradle.parallel', 'true'),
    ...unrelated,
  ]);
  expect(result).toEqual(
    expect.arrayContaining([
      ...unrelated,
      property(
        'org.gradle.jvmargs',
        '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',
      ),
      property('org.gradle.workers.max', '2'),
      property('org.gradle.parallel', 'false'),
      property('kotlin.daemon.jvmargs', '-Xmx2048m -XX:MaxMetaspaceSize=512m'),
    ]),
  );
  expect(result).toHaveLength(unrelated.length + 4);
});

test('repeated prebuilds remove conflicting duplicates and remain idempotent', () => {
  const result = apply([
    property('org.gradle.jvmargs', '-Xmx2048m'),
    property('org.gradle.jvmargs', '-Xmx512m'),
    property('org.gradle.workers.max', '8'),
    property('org.gradle.workers.max', '4'),
  ]);
  expect(apply(result)).toEqual(result);
  expect(result).toHaveLength(4);
  expect(new Set(result.map((item) => item.key)).size).toBe(4);
});
