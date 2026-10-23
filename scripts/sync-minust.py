"""Merge stable upstream releases without replacing customized source files."""
import json
from pathlib import Path
import re
import subprocess
from minust_sync import merge_release, verify_custom


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    upstream = json.loads(run('gh', 'api', 'repos/huamurui/zhihu-minus-minus/releases/latest'))
    tag = upstream['tag_name']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        raise SystemExit('上游标签格式变化，停止自动合并')
    subprocess.run(['git', 'fetch', '--no-tags', 'https://github.com/huamurui/zhihu-minus-minus.git', f'refs/tags/{tag}'], check=True, capture_output=True)
    commit = run('git', 'rev-parse', 'FETCH_HEAD^{commit}')
    subprocess.run(['git', 'config', 'user.name', 'shaoyou11'], check=True)
    subprocess.run(['git', 'config', 'user.email', 'shaoyou11@users.noreply.github.com'], check=True)
    merging = subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD']).returncode != 0
    if merging:
        merge_release(commit, tag)
    verify_custom()
    state = Path('custom/upstream.json')
    state.write_text(json.dumps({'repository': 'huamurui/zhihu-minus-minus', 'tag': tag, 'commit': commit}, indent=2) + '\n')
    subprocess.run(['git', 'add', str(state)], check=True)
    if merging or subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode:
        subprocess.run(['git', 'commit', '-m', f'同步：合并上游 {tag}，保留 minusT 定制'], check=True)
    print('上游已核对，定制约定通过；完整质量检查通过后才保存主分支。')


if __name__ == '__main__':
    main()
