"""Publish a complete draft atomically; retrying never replaces a public IPA."""
import json
import os
from pathlib import Path
import subprocess
import tempfile


def gh(*args, optional=False):
    result = subprocess.run(['gh', *args], text=True, capture_output=True)
    if result.returncode:
        if optional and ('not found' in result.stderr.lower() or '404' in result.stderr):
            return None
        raise RuntimeError('发行版操作未完成，请重试；未输出授权信息')
    return result.stdout


def verify_assets(release, files):
    assets = {asset['name']: asset['size'] for asset in release['assets']}
    for path in files:
        if assets.get(path.name) != path.stat().st_size:
            raise ValueError('发行版附件缺失或大小不一致：' + path.name)


def verify_existing(existing, expected):
    for key in ('sourceCommit', 'bundleId', 'version', 'build', 'kind'):
        if existing.get(key) != expected.get(key):
            raise ValueError('现有发行版与本次源码不一致，停止替换：' + key)
    if not existing.get('sha256'):
        raise ValueError('现有发行版缺少校验信息')


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    if not repo.startswith('shaoyou11/'):
        raise SystemExit('只能发布个人定制仓库')
    output = Path('dist')
    manifest = json.loads((output / 'minust-build.json').read_text())
    tag = f"v{manifest['version']}-build.{os.environ['GITHUB_RUN_NUMBER']}"
    files = [output / f"Zhihu-minusT-{manifest['version']}-build{manifest['build']}-unsigned.ipa",
             output / 'minust-build.json', output / 'SHA256SUMS.txt']
    raw = gh('release', 'view', tag, '--repo', repo, '--json', 'isDraft,assets', optional=True)
    release = json.loads(raw) if raw else None
    if release and not release['isDraft']:
        folder = Path(tempfile.mkdtemp(prefix='minust-published-'))
        gh('release', 'download', tag, '--repo', repo, '--pattern', 'minust-build.json', '--dir', str(folder))
        existing = json.loads((folder / 'minust-build.json').read_text())
        verify_existing(existing, manifest)
        if not any(asset['name'] == files[0].name and asset['size'] > 0 for asset in release['assets']):
            raise ValueError('现有正式发行版缺少安装包，请保留现场检查')
        print('同一源码的正式安装包已存在，复用原发布')
        return
    if release is None:
        gh('release', 'create', tag, '--repo', repo, '--draft', '--target', manifest['sourceCommit'],
           '--title', f"知乎 minusT {manifest['version']} · {os.environ['GITHUB_RUN_NUMBER']}",
           '--notes-file', 'docs/MINUST-RELEASE.txt')
    gh('release', 'upload', tag, '--repo', repo, '--clobber', *(str(path) for path in files))
    release = json.loads(gh('release', 'view', tag, '--repo', repo, '--json', 'isDraft,assets'))
    verify_assets(release, files)
    gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest')
    print('安装包、清单和校验文件完整，正式发布完成')


if __name__ == '__main__':
    main()
