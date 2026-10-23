const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');
const { APP_ICONS } = require('./app-icon.config');

const ANDROID_ICON_PREFIX = 'zhihu_icon_';

function androidResourceName(id) {
  return `${ANDROID_ICON_PREFIX}${id}`;
}

function isLauncherIntentFilter(intentFilter) {
  const actions = intentFilter.action ?? [];
  const categories = intentFilter.category ?? [];
  return (
    actions.some(
      (action) => action.$?.['android:name'] === 'android.intent.action.MAIN',
    ) &&
    categories.some(
      (category) =>
        category.$?.['android:name'] === 'android.intent.category.LAUNCHER',
    )
  );
}

function launcherIntentFilter() {
  return {
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
  };
}

function withAndroidAppIconManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      manifestConfig.modResults,
    );
    const targetActivity = mainActivity.$['android:name'];

    mainActivity['intent-filter'] = (
      mainActivity['intent-filter'] ?? []
    ).filter((intentFilter) => !isLauncherIntentFilter(intentFilter));

    const managedAliases = new Set(
      APP_ICONS.map(({ androidAlias }) => `.${androidAlias}`),
    );
    const existingAliases = (application['activity-alias'] ?? []).filter(
      (alias) => !managedAliases.has(alias.$?.['android:name']),
    );
    const iconAliases = APP_ICONS.map(({ id, androidAlias }) => {
      const iconResource = `@mipmap/${androidResourceName(id)}`;
      return {
        $: {
          'android:name': `.${androidAlias}`,
          'android:enabled': id === 'default' ? 'true' : 'false',
          'android:exported': 'true',
          'android:icon': iconResource,
          'android:roundIcon': iconResource,
          'android:targetActivity': targetActivity,
        },
        'intent-filter': [launcherIntentFilter()],
      };
    });
    application['activity-alias'] = [...existingAliases, ...iconAliases];
    return manifestConfig;
  });
}

function withAndroidAppIconResources(config) {
  return withDangerousMod(config, [
    'android',
    async (resourceConfig) => {
      const resourceRoot = path.join(
        resourceConfig.modRequest.platformProjectRoot,
        'app/src/main/res',
      );
      const valuesDirectory = path.join(resourceRoot, 'values');
      const drawableDirectory = path.join(resourceRoot, 'drawable-nodpi');
      const mipmapDirectory = path.join(resourceRoot, 'mipmap-nodpi');
      const adaptiveDirectory = path.join(resourceRoot, 'mipmap-anydpi-v26');
      for (const directory of [
        valuesDirectory,
        drawableDirectory,
        mipmapDirectory,
        adaptiveDirectory,
      ]) {
        fs.mkdirSync(directory, { recursive: true });
      }

      const sourceRoot = resourceConfig.modRequest.projectRoot;
      fs.copyFileSync(
        path.join(sourceRoot, 'src/assets/images/android-icon-foreground.png'),
        path.join(drawableDirectory, 'zhihu_icon_foreground.png'),
      );
      fs.copyFileSync(
        path.join(sourceRoot, 'src/assets/images/android-icon-monochrome.png'),
        path.join(drawableDirectory, 'zhihu_icon_monochrome.png'),
      );

      const colors = APP_ICONS.map(
        ({ id, color }) =>
          `  <color name="${androidResourceName(id)}_color">${color}</color>`,
      ).join('\n');
      fs.writeFileSync(
        path.join(valuesDirectory, 'zhihu_app_icon_colors.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${colors}\n</resources>\n`,
      );

      for (const { id, gradient, bands } of APP_ICONS) {
        const resourceName = androidResourceName(id);
        fs.copyFileSync(
          path.join(sourceRoot, `src/assets/images/app-icons/${id}.png`),
          path.join(mipmapDirectory, `${resourceName}.png`),
        );
        const usesImageBackground = gradient || bands;
        const backgroundResource = usesImageBackground
          ? `@drawable/${resourceName}_background`
          : `@color/${resourceName}_color`;
        if (usesImageBackground) {
          fs.copyFileSync(
            path.join(
              sourceRoot,
              `src/assets/images/app-icons/${id}-background.png`,
            ),
            path.join(drawableDirectory, `${resourceName}_background.png`),
          );
        }
        fs.writeFileSync(
          path.join(adaptiveDirectory, `${resourceName}.xml`),
          `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="${backgroundResource}" />
  <foreground android:drawable="@drawable/zhihu_icon_foreground" />
  <monochrome android:drawable="@drawable/zhihu_icon_monochrome" />
</adaptive-icon>
`,
        );
      }
      return resourceConfig;
    },
  ]);
}

function withIosAppIconInfoPlist(config) {
  return withInfoPlist(config, (plistConfig) => {
    const alternateIcons = Object.fromEntries(
      APP_ICONS.filter(({ iosName }) => iosName).map(({ iosName }) => [
        iosName,
        { CFBundleIconName: iosName, UIPrerenderedIcon: false },
      ]),
    );
    const iconDeclaration = { CFBundleAlternateIcons: alternateIcons };
    plistConfig.modResults.CFBundleIcons = {
      ...(plistConfig.modResults.CFBundleIcons ?? {}),
      ...iconDeclaration,
    };
    plistConfig.modResults['CFBundleIcons~ipad'] = {
      ...(plistConfig.modResults['CFBundleIcons~ipad'] ?? {}),
      ...iconDeclaration,
    };
    return plistConfig;
  });
}

function withIosAppIconBuildSettings(config) {
  return withXcodeProject(config, (projectConfig) => {
    const names = APP_ICONS.flatMap(({ iosName }) =>
      iosName ? [iosName] : [],
    );
    for (const buildConfiguration of Object.values(
      projectConfig.modResults.pbxXCBuildConfigurationSection(),
    )) {
      if (
        typeof buildConfiguration !== 'object' ||
        !buildConfiguration?.buildSettings?.ASSETCATALOG_COMPILER_APPICON_NAME
      ) {
        continue;
      }
      buildConfiguration.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${names.join(' ')}"`;
    }
    return projectConfig;
  });
}

function withIosAppIconAssets(config) {
  return withDangerousMod(config, [
    'ios',
    async (assetConfig) => {
      const projectName = assetConfig.modRequest.projectName;
      if (!projectName)
        throw new Error('Could not resolve the iOS project name.');
      const assetRoot = path.join(
        assetConfig.modRequest.platformProjectRoot,
        projectName,
        'Images.xcassets',
      );
      const sourceRoot = assetConfig.modRequest.projectRoot;
      for (const { id, iosName } of APP_ICONS) {
        if (!iosName) continue;
        const iconDirectory = path.join(assetRoot, `${iosName}.appiconset`);
        const filename = `${iosName}-1024.png`;
        fs.mkdirSync(iconDirectory, { recursive: true });
        fs.copyFileSync(
          path.join(sourceRoot, `src/assets/images/app-icons/${id}.png`),
          path.join(iconDirectory, filename),
        );
        fs.writeFileSync(
          path.join(iconDirectory, 'Contents.json'),
          `${JSON.stringify(
            {
              images: [
                {
                  filename,
                  idiom: 'universal',
                  platform: 'ios',
                  size: '1024x1024',
                },
              ],
              info: { author: 'expo', version: 1 },
            },
            null,
            2,
          )}\n`,
        );
      }
      return assetConfig;
    },
  ]);
}

module.exports = function withAppIcons(config) {
  config = withAndroidAppIconManifest(config);
  config = withAndroidAppIconResources(config);
  config = withIosAppIconInfoPlist(config);
  config = withIosAppIconBuildSettings(config);
  config = withIosAppIconAssets(config);
  return config;
};
