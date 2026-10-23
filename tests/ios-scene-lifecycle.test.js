// Exercise the actual installed Firebase plugin against Expo's scene template.
const {
  modifySwiftAppDelegate,
} = require('../node_modules/@react-native-firebase/app/plugin/build/ios/appDelegate');

// Keep this fixture independent of the ignored ios/ directory. SDK 58 owns the
// window and React Native startup through its generated ExpoAppSceneDelegate.
const SDK_58_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

describe('Firebase initialization with the SDK 58 scene lifecycle', () => {
  test('configures Firebase before handing startup to Expo', () => {
    const configured = modifySwiftAppDelegate(SDK_58_APP_DELEGATE);
    const initialization = configured.indexOf('FirebaseApp.configure()');

    expect(configured).toContain('import FirebaseCore');
    expect(initialization).toBeGreaterThan(0);
    expect(initialization).toBeLessThan(
      configured.indexOf(
        'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
      ),
    );
    expect(configured).toContain('reactNativeFactory = factory');
    expect(configured).not.toContain('startReactNative(');
    expect(configured).not.toContain('UIWindow(frame:');
    expect(configured).toContain(
      'RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")',
    );
    expect(configured).toContain(
      'Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    );
  });

  test('does not initialize Firebase twice on subsequent prebuilds', () => {
    const once = modifySwiftAppDelegate(SDK_58_APP_DELEGATE);

    expect(modifySwiftAppDelegate(once)).toBe(once);
    expect((once.match(/FirebaseApp\.configure\(\)/g) ?? []).length).toBe(1);
  });
});
