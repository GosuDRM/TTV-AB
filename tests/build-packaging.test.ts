import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("recreates source archives without files deleted since the previous build", () => {
	const build = fs.readFileSync(
		path.resolve(__dirname, "../build/build.js"),
		"utf8",
	);
	const start = build.indexOf("const sourceFiles = [");
	const end = build.indexOf(
		"console.log(`  Created ${path.basename(sourceZip)}`);",
		start,
	);
	expect(start).toBeGreaterThan(0);
	expect(end).toBeGreaterThan(start);
	const fixture = fs.mkdtempSync(
		path.join(tmpdir(), "ttvab-source-archive-test-"),
	);
	try {
		fs.mkdirSync(path.join(fixture, "src"));
		fs.writeFileSync(
			path.join(fixture, "src/current.ts"),
			"const current = 1;\n",
		);
		fs.writeFileSync(
			path.join(fixture, "src/deleted.ts"),
			"const deleted = 1;\n",
		);
		const sourceZip = path.join(fixture, "source.zip");
		const packageSource = () =>
			runInNewContext(build.slice(start, end), {
				SOURCE_ROOT: fixture,
				STATIC_ROOT_FILES: [],
				STATIC_ROOT_DIRECTORIES: [],
				sourceZip,
				fs,
				require: createRequire(import.meta.url),
			});
		packageSource();
		fs.rmSync(path.join(fixture, "src/deleted.ts"));
		fs.writeFileSync(
			path.join(fixture, "src/current.ts"),
			"const current = 2;\n",
		);
		packageSource();
		const entries = execFileSync("unzip", ["-Z1", sourceZip], {
			encoding: "utf8",
		})
			.trim()
			.split("\n");
		expect(entries).toContain("src/current.ts");
		expect(entries).not.toContain("src/deleted.ts");
		expect(
			execFileSync("unzip", ["-p", sourceZip, "src/current.ts"], {
				encoding: "utf8",
			}),
		).toBe("const current = 2;\n");
	} finally {
		fs.rmSync(fixture, { recursive: true, force: true });
	}
});
