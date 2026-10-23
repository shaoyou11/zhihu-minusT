#!/usr/bin/env python3
"""Strip local symbols from an unsigned staging .app, preserving runtime metadata.

Run after copying the build into Payload and before ZIP/signing. The source build
and its dSYMs stay intact. Signed binaries, symlinks and unsupported Mach-O slices
are rejected; all stripped copies are verified before staging files are replaced.
"""

import argparse
import hashlib
import os
from pathlib import Path
import plistlib
import shutil
import struct
import subprocess
import tempfile


MACHO64_LE = b"\xcf\xfa\xed\xfe"
OTHER_MACHO = {
    b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xce",
    b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",
    b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca",
}


def region(data, offset, size):
    if offset < 0 or size < 0 or offset + size > len(data):
        raise ValueError("Mach-O region is outside the file")
    return data[offset:offset + size]


def unpack(data, fmt, offset):
    return struct.unpack(fmt, region(data, offset, struct.calcsize(fmt)))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect_macho(data):
    """Inspect the device arm64 Mach-O format, without loading executable code."""
    magic = data[:4]
    if magic in OTHER_MACHO:
        raise ValueError("Only thin little-endian 64-bit device Mach-O is supported")
    if magic != MACHO64_LE:
        return None
    _, cpu, subtype, filetype, count, command_bytes, _, _ = unpack(data, "<8I", 0)
    if cpu != 0x0100000C or filetype not in (2, 6, 8):
        raise ValueError("Expected an arm64 executable, dylib or loadable bundle")
    commands_end = 32 + command_bytes
    region(data, 32, command_bytes)
    result = {"architecture": (cpu, subtype), "filetype": filetype,
              "uuid": None, "exports": [], "dyld_metadata": [], "dependencies": [],
              "sections": {}, "external_symbols": []}
    symtab = None
    offset = 32
    for _ in range(count):
        command, size = unpack(data, "<II", offset)
        if size < 8 or offset + size > commands_end:
            raise ValueError("Invalid Mach-O load command")
        payload = region(data, offset, size)
        if command == 0x1D:
            raise ValueError("Signed Mach-O refused; remove signatures only on a disposable copy first")
        if command == 0x1B:
            result["uuid"] = region(payload, 8, 16).hex()
        elif command == 2:
            symtab = unpack(payload, "<IIII", 8)
        elif command in (0x22, 0x80000022, 0x80000033):
            start, length = unpack(payload, "<II", 8 if command == 0x80000033 else 40)
            result["exports"].append(digest(region(data, start, length)))
            if command != 0x80000033:
                for field in (8, 16, 24, 32):
                    start, length = unpack(payload, "<II", field)
                    result["dyld_metadata"].append(digest(region(data, start, length)))
        elif command == 0x80000034:  # LC_DYLD_CHAINED_FIXUPS
            start, length = unpack(payload, "<II", 8)
            result["dyld_metadata"].append(digest(region(data, start, length)))
        elif command in (0xC, 0x80000018, 0x8000001F, 0x20, 0x80000023):
            name_offset, = unpack(payload, "<I", 8)
            result["dependencies"].append((command, region(payload, name_offset, size - name_offset)))
        elif command == 0x19:
            section_count, = unpack(payload, "<I", 64)
            for index in range(section_count):
                section = 72 + index * 80
                name = region(payload, section, 32)
                address, length = unpack(payload, "<QQ", section + 32)
                start, = unpack(payload, "<I", section + 48)
                flags, = unpack(payload, "<I", section + 64)
                # Zero-fill sections have no bytes in the file.
                content = None if flags & 0xFF in (1, 12, 18) else digest(region(data, start, length))
                result["sections"][name] = (address, length, flags, content)
        offset += size
    if offset != commands_end or result["uuid"] is None or symtab is None:
        raise ValueError("Incomplete Mach-O runtime metadata")
    symbol_offset, symbol_count, string_offset, string_size = symtab
    strings = region(data, string_offset, string_size)
    region(data, symbol_offset, symbol_count * 16)
    for index in range(symbol_count):
        name_offset, kind, section, description, address = unpack(data, "<IBBHQ", symbol_offset + index * 16)
        # N_STAB debug entries and local symbols may be removed. All external
        # definitions and undefined imports (including private externs) must match.
        if not kind & 0xE0 and kind & 1:
            end = strings.find(b"\0", name_offset)
            if name_offset >= len(strings) or end < 0:
                raise ValueError("Invalid external symbol name")
            name = strings[name_offset:end]
            result["external_symbols"].append((name, kind, section, description, address))
    result["external_symbols"].sort()
    return result


def strip_app(app):
    app = Path(app)
    if app.is_symlink() or not app.is_dir() or app.suffix != ".app":
        raise ValueError("Expected an unsigned staging .app directory")
    with (app / "Info.plist").open("rb") as stream:
        executable = plistlib.load(stream).get("CFBundleExecutable")
    if not isinstance(executable, str) or Path(executable).name != executable:
        raise ValueError("Invalid CFBundleExecutable")
    main = app / executable
    candidates = []
    for directory, names, files in os.walk(app, followlinks=False):
        for name in names + files:
            path = Path(directory) / name
            if path.is_symlink():
                raise ValueError("Symlinks are refused in the unsigned staging app")
            if name == "_CodeSignature":
                raise ValueError("Signed app refused; use an unsigned disposable copy")
        names[:] = [name for name in names if not name.endswith(".dSYM")]
        for name in files:
            path = Path(directory) / name
            data = path.read_bytes()
            metadata = inspect_macho(data)
            if metadata is not None:
                candidates.append((path, metadata, len(data)))
    if not any(path == main and metadata["filetype"] == 2 for path, metadata, _ in candidates):
        raise ValueError("App executable is missing or is not a supported device Mach-O")

    saved = 0
    with tempfile.TemporaryDirectory(prefix=".ios-strip-", dir=app.parent) as directory:
        replacements = []
        for index, (path, metadata, before_size) in enumerate(candidates):
            temporary = Path(directory) / str(index)
            shutil.copy2(path, temporary)
            subprocess.run(["xcrun", "strip", "-x", str(temporary)], check=True, capture_output=True, text=True)
            stripped = temporary.read_bytes()
            if inspect_macho(stripped) != metadata:
                raise ValueError("Stripping changed UUID, exports, imports or executable sections")
            if len(stripped) > before_size:
                raise ValueError("Stripping unexpectedly increased a binary")
            saved += before_size - len(stripped)
            replacements.append((temporary, path))
        # No staging executable changes until every binary passes validation.
        for temporary, path in replacements:
            os.replace(temporary, path)
    return len(candidates), saved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path, help="Unsigned .app copied into the packaging Payload")
    arguments = parser.parse_args()
    try:
        count, saved = strip_app(arguments.app)
    except (OSError, ValueError, struct.error, subprocess.CalledProcessError) as error:
        parser.exit(1, f"iOS strip failed: {error}\n")
    print(f"Verified and stripped {count} unsigned Mach-O binaries; saved {saved} uncompressed bytes.")


if __name__ == "__main__":
    main()
