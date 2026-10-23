import importlib.util
from pathlib import Path
import plistlib
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[2] / "scripts/strip-ios-app.py"
spec = importlib.util.spec_from_file_location("strip_ios_app", SCRIPT)
stripper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stripper)


def macho(local=True, uuid_byte=1, code=b"code", exports=b"export", fixups=b"fixup", signed=False, public_name=b"_public"):
    # A minimal arm64 image with runtime sections, exports, chained fixups and
    # local/external symbols. Linkedit offsets may change when stripping.
    text_offset = 512
    symbol_offset = 1024
    strings = b"\0" + public_name + b"\0" + (b"_private\0" if local else b"")
    symbols = struct.pack("<IBBHQ", 1, 0x0F, 1, 0, 0x1000)
    if local:
        symbols += struct.pack("<IBBHQ", 9, 0x0E, 1, 0, 0x1004)
    string_offset = symbol_offset + len(symbols)
    export_offset = string_offset + len(strings)
    fixup_offset = export_offset + len(exports)
    segment = struct.pack("<II16sQQQQIIII", 0x19, 152, b"__TEXT", 0x1000, 4096, 0, 1024, 5, 5, 1, 0)
    segment += struct.pack("<16s16sQQIIIIIIII", b"__text", b"__TEXT", 0x1000, len(code), text_offset, 2, 0, 0, 0, 0, 0, 0)
    commands = [
        struct.pack("<II16s", 0x1B, 24, bytes([uuid_byte]) * 16),
        segment,
        struct.pack("<6I", 2, 24, symbol_offset, 2 if local else 1, string_offset, len(strings)),
        struct.pack("<4I", 0x80000033, 16, export_offset, len(exports)),
        struct.pack("<4I", 0x80000034, 16, fixup_offset, len(fixups)),
    ]
    if signed:
        commands.append(struct.pack("<4I", 0x1D, 16, 0, 0))
    command_data = b"".join(commands)
    data = struct.pack("<8I", 0xFEEDFACF, 0x0100000C, 0, 2, len(commands), len(command_data), 0, 0)
    data += command_data
    data = data.ljust(text_offset, b"\0") + code
    return data.ljust(symbol_offset, b"\0") + symbols + strings + exports + fixups


class StripAppTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="ios strip tests ")
        self.addCleanup(self.directory.cleanup)
        self.app = Path(self.directory.name) / "App With Spaces.app"
        self.app.mkdir()
        (self.app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleExecutable": "My App"}))
        self.binary = self.app / "My App"
        self.binary.write_bytes(macho())
        self.binary.chmod(0o755)

    def fake_strip(self, arguments, **kwargs):
        self.assertEqual(arguments[:3], ["xcrun", "strip", "-x"])
        path = Path(arguments[3])
        self.assertNotEqual(path, self.binary)
        path.write_bytes(macho(local=False))
        return subprocess.CompletedProcess(arguments, 0)

    def test_strips_verified_copies_preserving_modes_resources_and_dsym(self):
        framework = self.app / "Frameworks" / "Test Framework.framework" / "Test Framework"
        framework.parent.mkdir(parents=True)
        framework.write_bytes(macho())
        resource = self.app / "resource.txt"
        resource.write_text("unchanged")
        dsym = self.app / "kept.dSYM" / "Contents" / "Resources" / "DWARF" / "app"
        dsym.parent.mkdir(parents=True)
        dsym.write_bytes(macho(signed=True))
        with patch.object(stripper.subprocess, "run", side_effect=self.fake_strip) as run:
            count, saved = stripper.strip_app(self.app)
        self.assertEqual(count, 2)
        self.assertEqual(run.call_count, 2)
        self.assertGreater(saved, 0)
        self.assertEqual(self.binary.read_bytes(), macho(local=False))
        self.assertEqual(framework.read_bytes(), macho(local=False))
        self.assertEqual(self.binary.stat().st_mode & 0o777, 0o755)
        self.assertEqual(resource.read_text(), "unchanged")
        self.assertEqual(dsym.read_bytes(), macho(signed=True))

    def test_rejects_signed_app_before_any_strip(self):
        for signature_directory in (False, True):
            with self.subTest(signature_directory=signature_directory):
                self.binary.write_bytes(macho(signed=not signature_directory))
                if signature_directory:
                    (self.app / "_CodeSignature").mkdir()
                with patch.object(stripper.subprocess, "run") as run:
                    with self.assertRaisesRegex(ValueError, "Signed"):
                        stripper.strip_app(self.app)
                    run.assert_not_called()

    def test_rejects_unsupported_architecture_symlink_and_malformed_binary(self):
        for bad in (b"\xca\xfe\xba\xbe" + b"\0" * 32, macho()[:40]):
            self.binary.write_bytes(bad)
            with self.assertRaises(ValueError):
                stripper.strip_app(self.app)
        self.binary.write_bytes(macho())
        (self.app / "linked").symlink_to(self.binary)
        with self.assertRaisesRegex(ValueError, "Symlinks"):
            stripper.strip_app(self.app)

    def test_failure_leaves_all_original_staging_binaries_intact(self):
        other = self.app / "another-binary"
        other.write_bytes(macho())
        calls = 0

        def fail_second(arguments, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise subprocess.CalledProcessError(1, arguments)
            return self.fake_strip(arguments, **kwargs)

        with patch.object(stripper.subprocess, "run", side_effect=fail_second):
            with self.assertRaises(subprocess.CalledProcessError):
                stripper.strip_app(self.app)
        self.assertEqual(self.binary.read_bytes(), macho())
        self.assertEqual(other.read_bytes(), macho())
        self.assertFalse(list(self.app.parent.glob(".ios-strip-*")))

    def test_refuses_changes_to_runtime_metadata(self):
        for change in ({"uuid_byte": 2}, {"code": b"fail"}, {"exports": b"wrong!"}, {"fixups": b"wrong"}, {"public_name": b"_broken"}):
            with self.subTest(change=change):
                def corrupt(arguments, **kwargs):
                    Path(arguments[3]).write_bytes(macho(local=False, **change))
                with patch.object(stripper.subprocess, "run", side_effect=corrupt):
                    with self.assertRaisesRegex(ValueError, "changed"):
                        stripper.strip_app(self.app)
                self.assertEqual(self.binary.read_bytes(), macho())

    def test_missing_main_executable_refused(self):
        self.binary.rename(self.app / "different")
        with self.assertRaisesRegex(ValueError, "App executable"):
            stripper.strip_app(self.app)


if __name__ == "__main__":
    unittest.main()
