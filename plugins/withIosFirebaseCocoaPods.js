const { withPodfile } = require('@expo/config-plugins');
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');

const TAG = '@react-native-firebase/app-disableSPM';
const ANCHOR = /prepare_react_native_project!/;
const FLAG = '$RNFirebaseDisableSPM = true';
const DEPLOYMENT_TARGET_TAG = 'ios-pods-minimum-deployment-target';
const POST_INSTALL_ANCHOR = /post_install do \|installer\|/;
const MINIMUM_DEPLOYMENT_TARGET = `installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        deployment_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target && Gem::Version.new(deployment_target) < Gem::Version.new('16.4')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
        end
      end
    end`;

module.exports = function withIosFirebaseCocoaPods(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = mergeContents({
      src: podfileConfig.modResults.contents,
      newSrc: FLAG,
      tag: TAG,
      anchor: ANCHOR,
      offset: 1,
      comment: '#',
    }).contents;
    podfileConfig.modResults.contents = mergeContents({
      src: podfileConfig.modResults.contents,
      newSrc: MINIMUM_DEPLOYMENT_TARGET,
      tag: DEPLOYMENT_TARGET_TAG,
      anchor: POST_INSTALL_ANCHOR,
      offset: 1,
      comment: '#',
    }).contents;
    return podfileConfig;
  });
};
