"""Skip rebuilding an unchanged source already published with verified metadata."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

repo = os.environ['GITHUB_REPOSITORY']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
releases = json.loads(subprocess.check_output(['gh', 'release', 'list', '--repo', repo, '--limit', '1', '--exclude-drafts', '--exclude-pre-releases', '--json', 'tagName'], text=True))
needed = True
if releases:
    # Temporary files are retained by the runner; no recursive cleanup.
    folder = Path(tempfile.mkdtemp(prefix='minust-manifest-'))
    result = subprocess.run(['gh', 'release', 'download', releases[0]['tagName'], '--repo', repo, '--pattern', 'minust-build.json', '--dir', str(folder)], capture_output=True)
    if result.returncode == 0:
        data = json.loads((folder / 'minust-build.json').read_text())
        release = json.loads(subprocess.check_output(['gh', 'release', 'view', releases[0]['tagName'], '--repo', repo, '--json', 'assets'], text=True))
        expected = f"Zhihu-minusT-{data.get('version')}-build{data.get('build')}-unsigned.ipa"
        has_ipa = any(asset['name'] == expected and asset.get('size', 0) > 0 for asset in release['assets'])
        needed = data.get('sourceCommit') != head or data.get('kind') != 'minust-custom' or not has_ipa
with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
    output.write(f'build={str(needed).lower()}\n')
print('需要编译新版本' if needed else '定制源码未变化，保留现有发布')
