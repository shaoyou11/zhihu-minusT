#!/usr/bin/env bash
# Real UIKit regression coverage for the patched screens scroll finder/tracker.
# Requires Xcode and an installed iOS 26+ simulator runtime. Uses an isolated simulator.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/zhihu-tab-binding.XXXXXX")"
simulator_id=""
cleanup() {
  if [[ -n "$simulator_id" ]]; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
  fi
  rm -rf "$build_dir"
}
trap cleanup EXIT

sdk_path="$(xcrun --sdk iphonesimulator --show-sdk-path)"
runtime_id="$(xcrun simctl list runtimes --json | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const runtime = JSON.parse(input).runtimes
    .filter(item => item.isAvailable && item.identifier.includes(".iOS-") && parseInt(item.version, 10) >= 26)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, {numeric: true}))[0];
  if (!runtime) throw new Error("An available iOS 26+ simulator runtime is required");
  process.stdout.write(runtime.identifier);
});')"
app_dir="$build_dir/TabBindingTests.app"
mkdir -p "$app_dir"
helper_dir="$repo_root/node_modules/react-native-screens/ios/helpers/scroll-view"
xcrun --sdk iphonesimulator clang++ \
  -std=c++20 -fobjc-arc -target "$(uname -m)-apple-ios16.4-simulator" -isysroot "$sdk_path" \
  -framework UIKit -framework Foundation -framework CoreGraphics \
  -I "$repo_root/node_modules/react-native-screens/ios/protocols" -I "$helper_dir" \
  "$repo_root/tests/native/ios-tab-scroll-binding.mm" \
  "$helper_dir/RNSScrollViewFinder.mm" "$helper_dir/RNSTabContentScrollViewTracker.mm" \
  -o "$app_dir/TabBindingTests"
cat > "$app_dir/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.zhihu.tests.tab-binding</string>
<key>CFBundleName</key><string>TabBindingTests</string>
<key>CFBundleExecutable</key><string>TabBindingTests</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>MinimumOSVersion</key><string>16.4</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UILaunchScreen</key><dict/>
</dict></plist>
PLIST
codesign --force --sign - "$app_dir" >/dev/null
simulator_id="$(xcrun simctl create ZhihuTabBindingTests com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro "$runtime_id")"
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b >/dev/null
xcrun simctl install "$simulator_id" "$app_dir"
xcrun simctl launch --console "$simulator_id" dev.zhihu.tests.tab-binding
container_path="$(xcrun simctl get_app_container "$simulator_id" dev.zhihu.tests.tab-binding data)"
node -e '
const result = require(process.argv[1]);
if (result.failures !== 0 || result.assertions < 20) process.exit(1);
console.log(`Passed ${result.assertions} real UIKit assertions.`);
' "$container_path/Documents/result.json"
