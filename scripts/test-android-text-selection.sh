#!/usr/bin/env bash
# Real Android regression test; requires a running emulator and compiled debug module.
# Compile first: (cd android && ./gradlew :zhihu-rich-text:compileDebugKotlin)
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
adb="$sdk_root/platform-tools/adb"
serial="${1:-${ANDROID_SERIAL:-$("$adb" devices | awk '/^emulator-.*device$/ {print $1; exit}')}}"
if [[ "$serial" != emulator-* ]]; then
  echo 'Start an Android emulator or set ANDROID_SERIAL to its emulator-* id.' >&2
  exit 1
fi
read -r default_tools default_platform <<< "$(python3 - "$sdk_root" <<'PY'
from pathlib import Path
import re, sys
sdk = Path(sys.argv[1])
def newest(directory, prefix=''):
    candidates = [p.name for p in directory.iterdir()
                  if re.fullmatch(prefix + r'\d+(?:\.\d+)*', p.name)]
    if not candidates:
        raise SystemExit(f'No stable Android SDK installation found in {directory}')
    return max(candidates, key=lambda name: tuple(map(int, re.findall(r'\d+', name))))
print(newest(sdk / 'build-tools'), newest(sdk / 'platforms', 'android-'))
PY
)"
build_tools="$sdk_root/build-tools/${ANDROID_BUILD_TOOLS_VERSION:-$default_tools}"
android_jar="$sdk_root/platforms/${ANDROID_PLATFORM:-$default_platform}/android.jar"
module_dir="$repo_root/modules/zhihu-rich-text/android"
class_dir="$module_dir/build/tmp/kotlin-classes/debug"
flow_class="$class_dir/com/zhihuminus/richtext/FlowTextView.class"
flow_source="$module_dir/src/main/java/com/zhihuminus/richtext/FlowTextView.kt"
if [[ ! -f "$flow_class" || "$flow_source" -nt "$flow_class" ]]; then
  echo 'Compile current production classes first: (cd android && ./gradlew :zhihu-rich-text:compileDebugKotlin)' >&2
  exit 1
fi
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/zhihu-selection.XXXXXX")"
package_id=com.zhihuminus.selectionprobe
cleanup() {
  "$adb" -s "$serial" uninstall "$package_id" >/dev/null 2>&1 || true
  rm -rf "$build_dir"
}
trap cleanup EXIT
mkdir -p "$build_dir/classes" "$build_dir/dex"

# Use the actual module's compiled classes, with no extra app dependencies.
kotlin_jar="$(python3 - "${GRADLE_USER_HOME:-$HOME/.gradle}" "$repo_root" <<'PY'
from pathlib import Path
import re, sys
root = Path(sys.argv[1]) / 'caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib'
repo = Path(sys.argv[2])
properties = (repo / 'android/gradle.properties').read_text()
override = re.search(r'^android\.kotlinVersion=(.+)$', properties, re.MULTILINE)
catalog = (repo / 'node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml').read_text()
version = override.group(1).strip() if override else re.search(r'^kotlin = "([^"]+)"', catalog, re.MULTILINE).group(1)
jars = list((root / version).glob('*/kotlin-stdlib-*.jar'))
if not jars:
    raise SystemExit(f'Kotlin stdlib {version} is missing; compile the native module first.')
print(jars[0])
PY
)"
python3 - "$class_dir" "$build_dir/flow.jar" <<'PY'
from pathlib import Path
import sys, zipfile
root = Path(sys.argv[1])
prefixes = ('FlowTextView', 'FlowData', 'TextConfig', 'RichTextModelsKt', 'TextRange')
with zipfile.ZipFile(sys.argv[2], 'w') as jar:
    for path in (root / 'com/zhihuminus/richtext').glob('*.class'):
        if path.name.startswith(prefixes):
            jar.write(path, path.relative_to(root))
PY
cat > "$build_dir/AndroidManifest.xml" <<'MANIFEST'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.zhihuminus.selectionprobe">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
  <application android:debuggable="true" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:label="Synthetic selection test">
    <activity android:name=".AndroidTextSelectionActivity" android:exported="true" />
  </application>
</manifest>
MANIFEST
"$build_tools/aapt2" link -o "$build_dir/unsigned.apk" -I "$android_jar" --manifest "$build_dir/AndroidManifest.xml"
javac -source 11 -target 11 -classpath "$android_jar:$build_dir/flow.jar:$kotlin_jar" \
  -d "$build_dir/classes" "$repo_root/tests/native/AndroidTextSelectionActivity.java"
"$build_tools/d8" --min-api 24 --lib "$android_jar" --output "$build_dir/dex" \
  "$build_dir/flow.jar" "$kotlin_jar" "$build_dir/classes/com/zhihuminus/selectionprobe/"*.class \
  > "$build_dir/d8.log" 2>&1 || { tail -n 40 "$build_dir/d8.log"; exit 1; }
zip -j -q "$build_dir/unsigned.apk" "$build_dir/dex/classes.dex"
keytool -genkeypair -keystore "$build_dir/probe.keystore" -alias probe -storepass android \
  -keypass android -keyalg RSA -keysize 2048 -validity 1 -dname CN=SyntheticSelectionTest >/dev/null 2>&1
"$build_tools/apksigner" sign --ks "$build_dir/probe.keystore" --ks-pass pass:android \
  --out "$build_dir/probe.apk" "$build_dir/unsigned.apk"
"$adb" -s "$serial" uninstall "$package_id" >/dev/null 2>&1 || true
"$adb" -s "$serial" install --no-incremental "$build_dir/probe.apk" >/dev/null
"$adb" -s "$serial" shell am start -n "$package_id/.AndroidTextSelectionActivity" >/dev/null
for attempt in $(seq 1 30); do
  if "$adb" -s "$serial" shell run-as "$package_id" cat files/result.json > "$build_dir/result.json" 2>/dev/null; then
    python3 - "$build_dir/result.json" <<'PY'
import json, sys
result = json.load(open(sys.argv[1]))
print(json.dumps(result))
if result['failures'] != 0 or result['assertions'] != 8:
    raise SystemExit(1)
PY
    exit 0
  fi
  sleep 1
done
echo 'Synthetic selection test did not finish. Check the ZhihuSelectionProbe log tag.' >&2
exit 1
