import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from minust_sync import MISSING, merge_json, merge_release, verify_custom

spec = importlib.util.spec_from_file_location('probe', SCRIPTS / 'minust-probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


publish_spec = importlib.util.spec_from_file_location('publish', SCRIPTS / 'minust-publish.py')
publisher = importlib.util.module_from_spec(publish_spec)
publish_spec.loader.exec_module(publisher)


class SyncTests(unittest.TestCase):
    def test_identity_is_retained_and_upstream_version_advances(self):
        base = {'expo': {'name': '上游', 'version': '0.9.4', 'ios': {'bundleIdentifier': 'original'}}}
        ours = {'expo': {'name': '知乎 minusT', 'version': '0.9.4', 'ios': {'bundleIdentifier': 'original'}}}
        theirs = {'expo': {'name': '上游新版', 'version': '0.9.5', 'ios': {'bundleIdentifier': 'changed'}}}
        merged = merge_json(base, ours, theirs)
        self.assertEqual(merged['expo']['name'], '知乎 minusT')
        self.assertEqual(merged['expo']['version'], '0.9.5')
        self.assertEqual(merged['expo']['ios']['bundleIdentifier'], 'original')

    def test_independent_settings_merge_without_discarding_either_side(self):
        merged = merge_json({'extra': {'a': 1}}, {'extra': {'a': 2}}, {'extra': {'a': 1, 'b': 3}})
        self.assertEqual(merged, {'extra': {'a': 2, 'b': 3}})

    def test_real_conflicts_and_delete_modify_conflicts_stop(self):
        with self.assertRaises(ValueError):
            merge_json({'engine': 'a'}, {'engine': 'b'}, {'engine': 'c'})
        with self.assertRaises(ValueError):
            merge_json({'option': {'a': 1}}, {}, {'option': {'a': 2}})
        self.assertIs(merge_json(1, MISSING, 1), MISSING)

    def git(self, root, *args):
        return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()

    def repository(self):
        # Retain generated test repositories; never recursively delete directories.
        root = Path(tempfile.mkdtemp(prefix='minust-merge-test-'))
        self.git(root, 'init', '-b', 'main')
        self.git(root, 'config', 'user.name', 'shaoyou11')
        self.git(root, 'config', 'user.email', 'shaoyou11@users.noreply.github.com')
        (root / 'app.json').write_text(json.dumps({'expo': {'name': 'upstream', 'version': '1.0.0'}}))
        (root / 'feature.txt').write_text('base\n')
        self.git(root, 'add', '.')
        self.git(root, 'commit', '-m', '测试：上游基线')
        self.git(root, 'branch', 'upstream')
        (root / 'app.json').write_text(json.dumps({'expo': {'name': '知乎 minusT', 'version': '1.0.0'}}))
        (root / 'feature.txt').write_text('custom\n')
        self.git(root, 'commit', '-am', '测试：个人定制')
        self.git(root, 'checkout', 'upstream')
        (root / 'app.json').write_text(json.dumps({'expo': {'name': 'upstream', 'version': '1.0.1'}}))
        return root

    def test_actual_git_config_conflict_is_resolved_without_losing_custom_source(self):
        root = self.repository()
        self.git(root, 'commit', '-am', '测试：上游新版')
        self.git(root, 'checkout', 'main')
        merge_release('upstream', 'v1.0.1', root)
        config = json.loads((root / 'app.json').read_text())['expo']
        self.assertEqual(config, {'name': '知乎 minusT', 'version': '1.0.1'})
        self.assertEqual((root / 'feature.txt').read_text(), 'custom\n')
        self.assertEqual(self.git(root, 'diff', '--name-only', '--diff-filter=U'), '')

    def test_actual_source_conflict_remains_unresolved_instead_of_choosing_ours(self):
        root = self.repository()
        (root / 'feature.txt').write_text('different upstream implementation\n')
        self.git(root, 'commit', '-am', '测试：上游修改同一功能')
        self.git(root, 'checkout', 'main')
        with self.assertRaisesRegex(ValueError, 'feature.txt'):
            merge_release('upstream', 'v1.0.1', root)
        self.assertIn('feature.txt', self.git(root, 'diff', '--name-only', '--diff-filter=U'))

    def test_contract_rejects_removed_custom_feature(self):
        root = Path(tempfile.mkdtemp(prefix='minust-contract-test-'))
        (root / 'custom').mkdir()
        (root / 'custom/contract.json').write_text(json.dumps({'identity': {'name': '知乎 minusT'}, 'features': {'feature.ts': ['required()']}}))
        (root / 'app.json').write_text(json.dumps({'expo': {'name': '知乎 minusT', 'version': '1'}}))
        (root / 'package.json').write_text(json.dumps({'version': '1'}))
        (root / 'feature.ts').write_text('required()')
        verify_custom(root)
        (root / 'feature.ts').write_text('removed()')
        with self.assertRaises(ValueError):
            verify_custom(root)

    def test_no_update_skips_build_but_new_release_unpublished_or_force_runs(self):
        self.assertFalse(probe.decide('schedule', False, 'v1', 'v1', False))
        self.assertTrue(probe.decide('schedule', False, 'v2', 'v1', False))
        self.assertTrue(probe.decide('schedule', False, 'v1', 'v1', True))
        self.assertTrue(probe.decide('workflow_dispatch', True, 'v1', 'v1', False))
        self.assertTrue(probe.decide('push', False, 'v1', 'v1', False))


    def test_partial_upload_cannot_be_published(self):
        root = Path(tempfile.mkdtemp(prefix='minust-assets-test-'))
        ipa = root / 'app.ipa'
        ipa.write_bytes(b'verified package')
        with self.assertRaises(ValueError):
            publisher.verify_assets({'assets': []}, [ipa])
        with self.assertRaises(ValueError):
            publisher.verify_assets({'assets': [{'name': ipa.name, 'size': 1}]}, [ipa])
        publisher.verify_assets({'assets': [{'name': ipa.name, 'size': ipa.stat().st_size}]}, [ipa])

    def test_public_release_cannot_be_replaced_with_a_different_source(self):
        expected = {'sourceCommit': 'a', 'bundleId': 'original', 'version': '1', 'build': '117', 'kind': 'minust-custom', 'sha256': 'digest'}
        publisher.verify_existing(expected, expected)
        with self.assertRaises(ValueError):
            publisher.verify_existing({**expected, 'sourceCommit': 'different'}, expected)


    def test_noop_probe_does_not_reset_failure_backoff(self):
        now = datetime.datetime(2026, 10, 23, 12, tzinfo=datetime.timezone.utc)
        failure = {'id': 1, 'status': 'completed', 'head_sha': 'same', 'conclusion': 'failure', 'updated_at': '2026-10-23T11:00:00Z'}
        noop = {**failure, 'id': 2, 'conclusion': 'success', 'updated_at': '2026-10-23T11:30:00Z'}
        self.assertTrue(probe.in_backoff([noop, failure], 'same', '3', now))
        self.assertFalse(probe.in_backoff([noop, failure], 'repaired', '3', now))
        self.assertFalse(probe.in_backoff([failure], 'same', '3', now + datetime.timedelta(hours=3)))


    def test_personal_workflow_is_retained_without_requiring_a_cloud_user_token(self):
        root = self.repository()
        self.git(root, 'commit', '-am', '测试：上游新版')
        self.git(root, 'checkout', 'main')
        folder = root / '.github/workflows'
        folder.mkdir(parents=True)
        (folder / 'build.yml').write_text('personal pipeline')
        self.git(root, 'add', '.github/workflows/build.yml')
        self.git(root, 'commit', '-m', '测试：个人编译流程')
        self.git(root, 'checkout', 'upstream')
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'build.yml').write_text('upstream pipeline')
        (root / '.nvmrc').write_text('26')
        self.git(root, 'add', '.')
        self.git(root, 'commit', '-m', '测试：升级运行环境与上游CI')
        self.git(root, 'checkout', 'main')
        merge_release('upstream', 'v1.0.1', root)
        self.assertEqual((folder / 'build.yml').read_text(), 'personal pipeline')
        self.assertEqual((root / '.nvmrc').read_text(), '26')
        self.assertEqual(self.git(root, 'diff', '--cached', '--name-only', '--', '.github/workflows'), '')


if __name__ == '__main__':
    unittest.main()
