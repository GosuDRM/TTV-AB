#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

sys.dont_write_bytecode = True

from package_chrome import is_packaged_path


def git_files(repo_root: Path, entries: list[str], *options: str) -> list[str]:
	listed = subprocess.run(
		["git", "ls-files", "-z", *options, "--", *entries],
		cwd=repo_root,
		check=True,
		capture_output=True,
	).stdout.decode("utf-8")
	return [name for name in listed.split("\0") if name]


def git_tracked_files(repo_root: Path, entries: list[str]) -> list[Path] | None:
	try:
		top_level = subprocess.run(
			["git", "rev-parse", "--show-toplevel"],
			cwd=repo_root,
			check=True,
			capture_output=True,
			text=True,
		).stdout.strip()
		if Path(top_level).resolve() != repo_root.resolve():
			return None
		tracked = git_files(repo_root, entries)
		untracked = git_files(repo_root, entries, "--others", "--exclude-standard")
	except (OSError, subprocess.CalledProcessError):
		return None
	if untracked:
		shown = ", ".join(untracked[:10])
		more = f" and {len(untracked) - 10} more" if len(untracked) > 10 else ""
		print(
			f"Source archive skipped {len(untracked)} file(s) not added to git: {shown}{more}",
			file=sys.stderr,
		)
	return [repo_root / name for name in tracked]


def directory_files(repo_root: Path, entries: list[str]) -> list[Path]:
	files = []
	for entry in entries:
		path = repo_root / entry
		if path.is_file():
			files.append(path)
		elif path.is_dir():
			files.extend(child for child in path.rglob("*") if child.is_file())
	return files


def main() -> int:
	if len(sys.argv) < 3:
		print("Usage: package_source.py <archive> <entry>...", file=sys.stderr)
		return 1
	repo_root = Path(__file__).resolve().parents[1]
	output_path = repo_root / sys.argv[1]
	entries = sys.argv[2:]
	candidates = git_tracked_files(repo_root, entries)
	if candidates is None:
		candidates = directory_files(repo_root, entries)
	files = sorted(
		{
			path
			for path in candidates
			if path.is_file()
			and is_packaged_path(path.relative_to(repo_root))
			and path.suffix not in {".zip", ".xpi"}
		}
	)
	if not files:
		print("No source files found to archive.", file=sys.stderr)
		return 1
	if output_path.exists():
		output_path.unlink()
	with ZipFile(output_path, mode="w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
		for file_path in files:
			archive.write(file_path, file_path.relative_to(repo_root).as_posix())
	return 0


if __name__ == "__main__":
	sys.exit(main())
