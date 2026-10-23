const { withGradleProperties } = require('@expo/config-plugins');

// Four ABI APKs share the Gradle daemon heap while being packaged. Keep the
// memory budget in prebuild configuration, not the ignored Android directory.
const BUILD_PROPERTIES = {
  'org.gradle.jvmargs':
    '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',
  'org.gradle.workers.max': '2',
  'org.gradle.parallel': 'false',
  // Kotlin otherwise inherits Gradle's larger heap. Keep its previous budget.
  'kotlin.daemon.jvmargs': '-Xmx2048m -XX:MaxMetaspaceSize=512m',
};

module.exports = function withAndroidBuildMemory(config) {
  return withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = [
      ...gradleConfig.modResults.filter(
        (item) =>
          item.type !== 'property' ||
          !Object.hasOwn(BUILD_PROPERTIES, item.key),
      ),
      ...Object.entries(BUILD_PROPERTIES).map(([key, value]) => ({
        type: 'property',
        key,
        value,
      })),
    ];
    return gradleConfig;
  });
};
