import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const roots: string[] = [];
const version = "19.0.4";
const manifest = (firefox: boolean) => ({
	manifest_version: 3,
	version,
	background: firefox
		? { scripts: ["background.js"] }
		: { service_worker: "background.js" },
});

function temporaryRoot(name: string) {
	const parent = mkdtempSync(join(tmpdir(), "ttv-ab-build-test-"));
	roots.push(parent);
	const root = join(parent, name);
	mkdirSync(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function packagingFixture(firefox: boolean, name: string, failure = "") {
	const root = temporaryRoot(name);
	const write = (file: string, text = "fixture") => {
		const target = join(root, file);
		mkdirSync(resolve(target, ".."), { recursive: true });
		writeFileSync(target, text);
	};
	write("package.json", JSON.stringify({ version }));
	write("manifest.json", JSON.stringify(manifest(firefox)));
	write("dist/manifest.json", JSON.stringify(manifest(firefox)));
	write("dist/background.js", "");
	for (const module of [
		"constants",
		"state",
		"logger",
		"parser",
		"api",
		"processor",
		"worker",
		"hooks",
		"player",
		"ui",
		"init",
	]) {
		write(`dist/src/modules/${module}.js`, "");
	}
	for (const file of [
		"CHANGELOG.md",
		"LICENSE",
		"PRIVACY.md",
		"README.md",
		"assets/icon",
		"_locales/en/messages.json",
		"src/source.ts",
		"tests/test.ts",
		"package-lock.json",
		"tsconfig.json",
		"tsconfig.base.json",
		"tsconfig.build.json",
		"tsconfig.modules.json",
		"tsconfig.runtime.json",
		"build.ts",
		"biome.json",
		"vitest.config.mts",
		"knip.json",
		".gitignore",
		".editorconfig",
	]) {
		write(file);
	}
	write(
		"tools/package_chrome.py",
		readFileSync(resolve(__dirname, "../tools/package_chrome.py"), "utf8"),
	);
	const archiveNames = [
		`ttv-ab-${version}-chrome-store.zip`,
		`ttv-ab-${version}.xpi`,
		`ttv-ab-${version}-source.zip`,
	];
	for (const file of firefox ? archiveNames : archiveNames.slice(0, 1))
		write(file, "stale archive");
	const exit = vi.fn();
	const context = createContext({
		__dirname: root,
		process: { execPath: process.execPath, exit },
		console: { log: vi.fn(), error: vi.fn() },
		require: (id: string) =>
			id === "node:child_process"
				? {
						execFileSync: (
							command: string,
							args: string[],
							options: object,
						) => {
							if (failure === "missing" && command === "python3") return;
							if (
								(failure === "extension" && command === "python3") ||
								(failure === "source" && command === "zip")
							) {
								write(
									command === "python3" ? archiveNames[0] : archiveNames[2],
									"partial archive",
								);
								throw new Error("fixture packaging failed");
							}
							return execFileSync(command, args, { ...options, stdio: "pipe" });
						},
					}
				: require(id),
	});
	const code = readFileSync(
		resolve(__dirname, "../build/build.js"),
		"utf8",
	).replace(/\bbuild\(\);\s*$/, "");
	runInContext(code, context);
	context.compileTypeScriptSources = () => {};
	context.prepareDistStaticFiles = () => {};
	context.syncPopupHtmlFallbacks = () => {};
	context.validateSharedDefinitions = () => {};
	context.getVersion = () => version;
	context.build();
	return { root, exit, archiveNames, build: () => context.build() };
}

describe("build packaging contract", () => {
	it("recreates source archives without files deleted since the previous build", () => {
		const { root, exit, archiveNames, build } = packagingFixture(
			true,
			"generic-checkout",
		);
		writeFileSync(join(root, "src/deleted.ts"), "const deleted = 1;");
		build();
		rmSync(join(root, "src/deleted.ts"));
		writeFileSync(join(root, "src/source.ts"), "const current = 2;");
		build();
		expect(exit).not.toHaveBeenCalled();
		const output = execFileSync(
			"python3",
			[
				"-c",
				"import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'files':z.namelist(),'source':z.read('src/source.ts').decode()}))",
				join(root, archiveNames[2]),
			],
			{ encoding: "utf8" },
		);
		const archive = JSON.parse(output);
		expect(archive.files).toContain("src/source.ts");
		expect(archive.files).not.toContain("src/deleted.ts");
		expect(archive.source).toBe("const current = 2;");
	});

	it.each([
		[true, "generic-checkout"],
		[false, "directory-containing-firefox"],
	] as const)(
		"selects browser artifacts from the manifest (%s, %s)",
		(firefox, name) => {
			const { root, exit, archiveNames } = packagingFixture(firefox, name);
			expect(exit).not.toHaveBeenCalled();
			expect(existsSync(join(root, archiveNames[0]))).toBe(!firefox);
			expect(existsSync(join(root, archiveNames[1]))).toBe(firefox);
			expect(existsSync(join(root, archiveNames[2]))).toBe(firefox);
			const archive = join(root, archiveNames[firefox ? 1 : 0]);
			const embedded = execFileSync(
				"python3",
				[
					"-c",
					"import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read('manifest.json').decode())",
					archive,
				],
				{ encoding: "utf8" },
			);
			expect(JSON.parse(embedded)).toEqual(manifest(firefox));
		},
	);

	it.each(["extension", "source", "missing"])(
		"fails and removes stale/partial artifacts when %s packaging fails",
		(failure) => {
			const { root, exit, archiveNames } = packagingFixture(
				true,
				"generic-checkout",
				failure,
			);
			expect(exit).toHaveBeenCalledWith(1);
			for (const name of archiveNames)
				expect(existsSync(join(root, name))).toBe(false);
		},
	);
});

function releaseFixture() {
	const root = temporaryRoot("release");
	const git = (...args: string[]) =>
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Release Test",
				"-c",
				"user.email=release@example.invalid",
				"-c",
				"commit.gpgsign=false",
				"-c",
				"tag.gpgsign=false",
				...args,
			],
			{ cwd: root, encoding: "utf8", stdio: "pipe" },
		).trim();
	const commit = (value: object) => {
		writeFileSync(join(root, "manifest.json"), JSON.stringify(value));
		git("add", "manifest.json");
		git("commit", "-m", "fixture");
		return git("rev-parse", "HEAD");
	};
	git("init", "-b", "main");
	const chrome = commit(manifest(false));
	git("checkout", "-b", "firefox");
	const firefox = commit(manifest(true));
	git("checkout", "main");
	const tag = `v${version}`;
	const annotate = (text: string) => git("tag", "-a", tag, "-m", text);
	const run = () =>
		spawnSync(
			process.execPath,
			[resolve(__dirname, "../tools/resolve_firefox_release.cjs")],
			{
				cwd: root,
				env: { ...process.env, RELEASE_TAG: tag },
				encoding: "utf8",
			},
		);
	return { git, commit, chrome, firefox, tag, annotate, run };
}

describe("immutable Firefox release source", () => {
	it("resolves the same Firefox commit after its branch advances", () => {
		const f = releaseFixture();
		f.annotate(`Release\n\nFirefox-Commit: ${f.firefox}`);
		expect(f.run().stdout).toBe(`commit=${f.firefox}\n`);
		f.git("checkout", "firefox");
		f.commit({ ...manifest(true), description: "newer same-version source" });
		f.git("checkout", "main");
		const rerun = f.run();
		expect(rerun.status).toBe(0);
		expect(rerun.stdout).toBe(`commit=${f.firefox}\n`);
	});

	it.each(["missing", "duplicate", "chrome", "lightweight", "wrong-head"])(
		"rejects an ambiguous or invalid release tag: %s",
		(kind) => {
			const f = releaseFixture();
			const line = `Firefox-Commit: ${kind === "chrome" ? f.chrome : f.firefox}`;
			if (kind === "lightweight") f.git("tag", f.tag);
			else
				f.annotate(
					kind === "missing"
						? "Release"
						: kind === "duplicate"
							? `${line}\n${line}`
							: line,
				);
			if (kind === "wrong-head")
				f.commit({ ...manifest(false), description: "new head" });
			const result = f.run();
			expect(result.status).not.toBe(0);
			expect(result.stdout).toBe("");
		},
	);
});
