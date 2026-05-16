#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main() -> int:
	repo_root = Path(__file__).resolve().parents[1]
	dist_dir = repo_root / "dist"
	manifest_path = dist_dir / "manifest.json"

	if not manifest_path.is_file():
		print("dist/manifest.json not found. Run `npm run build` first.", file=sys.stderr)
		return 1

	manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
	version = manifest.get("version")

	if not isinstance(version, str) or not version:
		print("dist/manifest.json is missing a valid version.", file=sys.stderr)
		return 1

	output_path = repo_root / f"ttv-ab-{version}-chrome-store.zip"

	if output_path.exists():
		output_path.unlink()

	files = sorted(path for path in dist_dir.rglob("*") if path.is_file())

	if not files:
		print("dist/ is empty. Run `npm run build` first.", file=sys.stderr)
		return 1

	with ZipFile(output_path, mode="w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
		for file_path in files:
			archive.write(file_path, file_path.relative_to(dist_dir).as_posix())

	size_kib = output_path.stat().st_size / 1024
	print(f"Created {output_path.name}")
	print(f"Files: {len(files)}")
	print(f"Size: {size_kib:.2f} KiB")
	return 0


if __name__ == "__main__":
	sys.exit(main())
