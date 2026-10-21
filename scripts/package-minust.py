"""Package only the verified device app and publish its digest."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import zipfile

apps = list(Path(sys.argv[1]).glob('*.app'))
if len(apps) != 1:
    raise SystemExit('必须且只能找到一个编译完成的 App')
app = apps[0]
info = plistlib.loads((app / 'Info.plist').read_bytes())
expected = json.loads(Path('app.json').read_text())['expo']
assert info['CFBundleIdentifier'] == expected['ios']['bundleIdentifier']
assert info['CFBundleDisplayName'] == expected['name']
assert info['CFBundleShortVersionString'] == expected['version']
assert info['CFBundleVersion'] == expected['ios']['buildNumber']
assert (app / 'main.jsbundle').is_file(), '缺少离线 JS bundle'
assert info['CFBundleSupportedPlatforms'] == ['iPhoneOS']
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
ipa = output / f"Zhihu-minusT-{expected['version']}-build{info['CFBundleVersion']}-unsigned.ipa"
# ditto preserves framework symlinks and excludes extended attributes.
stage = output / 'package'
(stage / 'Payload').mkdir(parents=True, exist_ok=True)
subprocess.run(['ditto', '--norsrc', '--noextattr', '--noacl', str(app), str(stage / 'Payload' / app.name)], check=True)
subprocess.run(['ditto', '-c', '-k', '--norsrc', '--noextattr', 'Payload', str(ipa)], cwd=stage, check=True)
with zipfile.ZipFile(ipa) as archive:
    assert archive.testzip() is None
sha = hashlib.sha256(ipa.read_bytes()).hexdigest()
(output / 'SHA256SUMS.txt').write_text(f'{sha}  {ipa.name}\n')
(output / 'minust-build.json').write_text(json.dumps({
    'name': expected['name'], 'bundleId': info['CFBundleIdentifier'],
    'version': expected['version'], 'build': info['CFBundleVersion'],
    'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'sha256': sha,
    'kind': 'minust-custom', 'branch': 'main',
    'upstreamTag': json.loads(Path('custom/upstream.json').read_text())['tag'],
    'repository': os.environ.get('GITHUB_REPOSITORY', ''),
}, ensure_ascii=False, indent=2) + '\n')
print(f'已校验：{expected["name"]}，版本 {expected["version"]}，构建 {info["CFBundleVersion"]}')
