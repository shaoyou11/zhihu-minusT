"""Conservative three-way config merge and checks for the minusT feature contract."""
import json
from pathlib import Path
import subprocess

MISSING = object()
IDENTITY_PATHS = {
    ('expo', 'name'), ('expo', 'slug'), ('expo', 'scheme'),
    ('expo', 'ios', 'bundleIdentifier'), ('expo', 'android', 'package'),
}


def merge_json(base, ours, theirs, path=()):
    if path in IDENTITY_PATHS and ours is not MISSING:
        return ours
    if isinstance(ours, dict) and isinstance(theirs, dict) and (isinstance(base, dict) or base is MISSING):
        base = {} if base is MISSING else base
        result = {}
        for key in sorted(base.keys() | ours.keys() | theirs.keys()):
            value = merge_json(base.get(key, MISSING), ours.get(key, MISSING),
                               theirs.get(key, MISSING), (*path, key))
            if value is not MISSING:
                result[key] = value
        return result
    if ours == theirs or theirs == base:
        return ours
    if ours == base:
        return theirs
    raise ValueError('配置存在真实冲突：' + '.'.join(path))


def merge_release(commit, tag, root=Path('.')):
    def git(*args, **kwargs):
        return subprocess.run(['git', *args], cwd=root, check=False,
                              capture_output=True, text=True, **kwargs)
    result = git('merge', '--no-ff', '--no-commit', commit)
    # Personal CI is owned by this fork. Do not import upstream workflow changes
    # with GITHUB_TOKEN, which cannot grant itself workflow-write permission.
    owned = git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.github/workflows').stdout.splitlines()
    incoming = git('diff', '--cached', '--name-only', '--diff-filter=A', '--', '.github/workflows').stdout.splitlines()
    if any(path not in owned for path in incoming):
        raise ValueError('上游新增工作流，需定时维护核对；停止自动发布')
    for filename in owned:
        if git('restore', '--source=HEAD', '--staged', '--worktree', '--', filename).returncode:
            raise ValueError('无法保留个人工作流：' + filename)
    if result.returncode:
        conflicts = git('diff', '--name-only', '--diff-filter=U').stdout.splitlines()
        if 'app.json' in conflicts:
            stages = [git('show', f':{stage}:app.json') for stage in (1, 2, 3)]
            if any(stage.returncode for stage in stages):
                raise ValueError('应用配置无法进行三方合并')
            merged = merge_json(*(json.loads(stage.stdout) for stage in stages))
            (root / 'app.json').write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n')
            git('add', 'app.json')
        conflicts = git('diff', '--name-only', '--diff-filter=U').stdout.splitlines()
        if conflicts:
            raise ValueError('定制代码冲突，保留现场并停止发布：' + '、'.join(conflicts))
        if result.returncode and git('rev-parse', '--verify', 'MERGE_HEAD').returncode != 0:
            raise ValueError('上游合并未完成')
    return tag


def verify_custom(root=Path('.')):
    contract = json.loads((root / 'custom/contract.json').read_text())
    config = json.loads((root / 'app.json').read_text())['expo']
    for key, expected in contract['identity'].items():
        value = config
        for segment in key.split('.'):
            value = value[segment]
        if value != expected:
            raise ValueError('定制安装标识变化：' + key)
    if config['version'] != json.loads((root / 'package.json').read_text())['version']:
        raise ValueError('应用与依赖版本不一致')
    for filename, markers in contract['features'].items():
        path = root / filename
        if not path.is_file() or any(marker not in path.read_text() for marker in markers):
            raise ValueError('定制功能保护检查未通过：' + filename)

    for filename in ('src/app/comments/[id].tsx', 'src/app/comments/replies/[id].tsx'):
        if filename not in contract['features']:
            continue
        source = (root / filename).read_text()
        if source.find('<FlashList') < 0 or source.find('<KeyboardAnchorNativeView') < source.find('<FlashList'):
            raise ValueError('评论列表须先于键盘辅助视图，防止标题栏遮挡：' + filename)
