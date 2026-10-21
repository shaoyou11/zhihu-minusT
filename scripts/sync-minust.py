"""Merge official stable releases; never resolve conflicts by discarding custom code."""
import json
from pathlib import Path
import re
import subprocess


def run(*args):
    return subprocess.check_output(args, text=True).strip()


upstream = json.loads(run('gh', 'api', 'repos/huamurui/zhihu-minus-minus/releases/latest'))
tag = upstream['tag_name']
if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
    raise SystemExit('上游标签格式变化，停止自动合并')
subprocess.run(['git', 'fetch', '--no-tags', 'https://github.com/huamurui/zhihu-minus-minus.git', f'refs/tags/{tag}'], check=True)
commit = run('git', 'rev-parse', 'FETCH_HEAD^{commit}')
subprocess.run(['git', 'config', 'user.name', 'shaoyou11'], check=True)
subprocess.run(['git', 'config', 'user.email', 'shaoyou11@users.noreply.github.com'], check=True)
if subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD']).returncode:
    subprocess.run(['git', 'merge', '--no-ff', commit, '-m', f'同步：合并上游 {tag}，保留 minusT 定制'], check=True)
config = json.loads(Path('app.json').read_text())['expo']
assert config['name'] == '知乎 minusT', '定制名称变化，停止发布'
assert config['ios']['bundleIdentifier'] == 'com.huamu013.ZhihuMinusMinus', '覆盖更新标识变化'
assert config['version'] == json.loads(Path('package.json').read_text())['version']
for filename in ['components/DetailGlassSurface.tsx', 'hooks/useReadingActionBar.ts']:
    assert Path(filename).is_file(), '缺少定制实现，停止发布'
state = Path('custom/upstream.json')
state.write_text(json.dumps({'repository': 'huamurui/zhihu-minus-minus', 'tag': tag, 'commit': commit}, indent=2) + '\n')
subprocess.run(['git', 'add', str(state)], check=True)
if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode:
    subprocess.run(['git', 'commit', '-m', f'记录：minusT 上游基线 {tag}'], check=True)
print('上游已核对，定制标识保留；质量检查通过后才保存分支。')
