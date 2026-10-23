"""Cheap hourly probe: unchanged upstream and verified release skip dependency installation."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def decide(event, force, upstream, baseline, unpublished):
    return force or event == 'push' or upstream != baseline or unpublished


def in_backoff(runs, head, current_id, now):
    for run in runs:
        if (str(run['id']) != current_id and run['status'] == 'completed'
                and run['head_sha'] == head
                and run['conclusion'] in ('failure', 'timed_out', 'startup_failure')):
            completed = datetime.datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
            if (now - completed).total_seconds() < 7200:
                return True
    return False


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    if not repo.startswith('shaoyou11/'):
        raise SystemExit('只能运行个人定制仓库')
    upstream = json.loads(subprocess.check_output(['gh', 'api', 'repos/huamurui/zhihu-minus-minus/releases/latest'], text=True))['tag_name']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', upstream):
        raise SystemExit('上游正式版标签格式变化')
    state = json.loads(Path('custom/upstream.json').read_text())
    force = os.environ.get('FORCE_MINUST_BUILD') == 'true'
    event = os.environ.get('GITHUB_EVENT_NAME', '')
    unpublished = False
    if not force and event != 'push' and upstream == state['tag']:
        folder = Path(tempfile.mkdtemp(prefix='minust-probe-'))
        output = folder / 'result'
        subprocess.run(['python3', 'scripts/minust-build-needed.py'],
                       env={**os.environ, 'GITHUB_OUTPUT': str(output)}, check=True)
        unpublished = 'build=true' in output.read_text().splitlines()
    needed = decide(event, force, upstream, state['tag'], unpublished)
    # Back off the same failing source for two hours; a repair commit or force bypasses this.
    if needed and event == 'schedule' and not force:
        runs = json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/actions/workflows/minust-ios.yml/runs?branch=main&per_page=10'], text=True))['workflow_runs']
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        if in_backoff(runs, head, os.environ.get('GITHUB_RUN_ID'), datetime.datetime.now(datetime.timezone.utc)):
            needed = False
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'needed={str(needed).lower()}\n')
    print(f'上游 {upstream}；' + ('需要同步或补发构建' if needed else '无须重复编译，或处于失败退避期'))


if __name__ == '__main__':
    main()
