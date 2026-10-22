import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
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

function writer(root: string) {
	return (file: string, text = "fixture") => {
		const target = join(root, file);
		mkdirSync(resolve(target, ".."), { recursive: true });
		writeFileSync(target, text);
	};
}

function zipEntries(archive: string): string[] {
	return JSON.parse(
		execFileSync(
			"python3",
			[
				"-c",
				"import sys,zipfile,json; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))",
				archive,
			],
			{ encoding: "utf8" },
		),
	);
}

function loadBuildContext(
	root: string,
	options: {
		exit?: ReturnType<typeof vi.fn>;
		execFile?: (command: string, args: string[], options: object) => unknown;
	} = {},
) {
	const context = createContext({
		exports: {},
		__dirname: root,
		process: {
			execPath: process.execPath,
			exit: options.exit || vi.fn(),
			env: {},
			platform: "linux",
		},
		console: { log: vi.fn(), error: vi.fn() },
		require: (id: string) =>
			id === "./tools/build-worker"
				? {
						...require(resolve(__dirname, "../build/tools/build-worker.js")),
						buildWorkerBundle: () => ({ source: "", code: "" }),
						embedWorkerBundle: (source: string) => source,
					}
				: id === "node:child_process" && options.execFile
					? { execFileSync: options.execFile }
					: require(id),
	});
	const code = readFileSync(
		resolve(__dirname, "../build/build.js"),
		"utf8",
	).replace(/\bbuild\(\);\s*$/, "");
	runInContext(code, context);
	return context;
}

function packagingFixture(
	firefox: boolean,
	name: string,
	failure = "",
	setup?: (write: (file: string, text?: string) => void, root: string) => void,
) {
	const root = temporaryRoot(name);
	const write = writer(root);
	write("package.json", JSON.stringify({ version }));
	write("manifest.json", JSON.stringify(manifest(firefox)));
	write("dist/manifest.json", JSON.stringify(manifest(firefox)));
	write("dist/background.js", "");
	write(
		"dist/src/scripts/background.d.ts",
		"declare const background: string;",
	);
	write("dist/tsconfig.modules.tsbuildinfo", "compiler cache");
	write("dist/src/popup/popup.js", "globalThis.popupLoaded = true;");
	write("dist/src/popup/popup.html", '<script src="popup.js"></script>');
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
	if (failure === "module") write("dist/src/modules/unlisted.js", "");
	if (failure === "source-content") write("src/scripts/content.js", "");
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
	for (const tool of ["package_chrome.py", "package_source.py"]) {
		write(
			`tools/${tool}`,
			readFileSync(resolve(__dirname, `../tools/${tool}`), "utf8"),
		);
	}
	const archiveNames = [
		`ttv-ab-${version}-chrome-store.zip`,
		`ttv-ab-${version}.xpi`,
		`ttv-ab-${version}-source.zip`,
	];
	for (const file of firefox ? archiveNames : archiveNames.slice(0, 1))
		write(file, "stale archive");
	setup?.(write, root);
	const exit = vi.fn();
	const context = loadBuildContext(root, {
		exit,
		execFile: (command: string, args: string[], options: object) => {
			const script = command === "python3" ? args[0] : null;
			if (failure === "missing" && script === "tools/package_chrome.py") return;
			if (
				(failure === "extension" && script === "tools/package_chrome.py") ||
				(failure === "source" && script === "tools/package_source.py")
			) {
				write(
					script === "tools/package_chrome.py"
						? archiveNames[0]
						: archiveNames[2],
					"partial archive",
				);
				throw new Error("fixture packaging failed");
			}
			return execFileSync(command, args, {
				...options,
				stdio: "pipe",
			});
		},
	});
	context.compileTypeScriptSources =
		failure === "compile"
			? () => {
					throw new Error("fixture compile failed");
				}
			: () => {};
	context.prepareDistStaticFiles = () => {};
	context.syncPopupHtmlFallbacks = () => {};
	context.validateSharedDefinitions = () => {};
	context.getVersion = () => version;
	context.build();
	return { root, exit, archiveNames, build: () => context.build() };
}

describe("build packaging contract", () => {
	it("ships runtime files without compiler intermediates or system metadata", () => {
		const { root, exit, archiveNames } = packagingFixture(
			true,
			"runtime-only",
			"",
			(write) => {
				write("dist/.DS_Store");
				write("dist/src/popup/._popup.js");
				write("dist/__MACOSX/src/popup/popup.js");
				write("dist/src/popup/Thumbs.db");
			},
		);
		expect(exit).not.toHaveBeenCalled();
		const files = zipEntries(join(root, archiveNames[1]));
		expect(files).toEqual([
			"background.js",
			"manifest.json",
			"src/popup/popup.html",
			"src/popup/popup.js",
			"src/scripts/content.js",
		]);
	});

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

	it("archives only tracked source files from a git checkout", () => {
		const { root, exit, archiveNames } = packagingFixture(
			true,
			"git-checkout",
			"",
			(write, fixtureRoot) => {
				const git = (...args: string[]) =>
					execFileSync(
						"git",
						[
							"-c",
							"user.name=Build Test",
							"-c",
							"user.email=build@example.invalid",
							"-c",
							"commit.gpgsign=false",
							...args,
						],
						{ cwd: fixtureRoot, stdio: "pipe" },
					);
				git("init", "-b", "firefox");
				git("add", "-A");
				git("commit", "-m", "fixture");
				write("src/untracked.ts", "local scratch file");
				write("tests/.DS_Store");
			},
		);
		expect(exit).not.toHaveBeenCalled();
		const files = zipEntries(join(root, archiveNames[2]));
		expect(files).toContain("src/source.ts");
		expect(files).toContain("tools/package_source.py");
		expect(files).not.toContain("src/untracked.ts");
		expect(files).not.toContain("tests/.DS_Store");
	});

	it("leaves system metadata out of source archives outside git", () => {
		const { root, exit, archiveNames } = packagingFixture(
			true,
			"plain-folder",
			"",
			(write) => {
				write("src/.DS_Store");
				write("tests/._test.ts");
				write("tools/__pycache__/package_chrome.cpython-314.pyc");
			},
		);
		expect(exit).not.toHaveBeenCalled();
		const files = zipEntries(join(root, archiveNames[2]));
		expect(files).toContain("src/source.ts");
		expect(
			files.filter((file) => /(^|\/)(\.DS_Store|\._|__pycache__)/.test(file)),
		).toEqual([]);
	});

	it("copies only the files the extension uses into dist", () => {
		const root = temporaryRoot("static-files");
		const write = writer(root);
		for (const file of [
			"package.json",
			"manifest.json",
			"LICENSE",
			"PRIVACY.md",
			"README.md",
			"CHANGELOG.md",
			"assets/icons/icon16.png",
			"assets/popup2.png",
			"assets/pipeline.svg",
			"_locales/en/messages.json",
		])
			write(file);
		loadBuildContext(root).prepareDistStaticFiles();
		const dist = join(root, "dist");
		const files = readdirSync(dist, { recursive: true })
			.map(String)
			.filter((file) => statSync(join(dist, file)).isFile())
			.map((file) => file.split("\\").join("/"))
			.sort();
		expect(files).toEqual([
			"LICENSE",
			"PRIVACY.md",
			"_locales/en/messages.json",
			"assets/icons/icon16.png",
			"manifest.json",
		]);
	});

	it.each([
		"extension",
		"source",
		"missing",
		"compile",
		"module",
		"source-content",
	])("fails and removes stale/partial artifacts when %s fails", (failure) => {
		const { root, exit, archiveNames } = packagingFixture(
			true,
			"generic-checkout",
			failure,
		);
		expect(exit).toHaveBeenCalledWith(1);
		for (const name of archiveNames)
			expect(existsSync(join(root, name))).toBe(false);
	});
});

it("rejects core module type errors through the standalone typecheck command", () => {
	const root = temporaryRoot("typecheck");
	const packageJson = JSON.parse(
		readFileSync(resolve(__dirname, "../package.json"), "utf8"),
	);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ scripts: { typecheck: packageJson.scripts.typecheck } }),
	);
	for (const config of [
		"tsconfig.json",
		"tsconfig.base.json",
		"tsconfig.modules.json",
		"tsconfig.runtime.json",
		"tsconfig.build.json",
	]) {
		const value = JSON.parse(
			readFileSync(resolve(__dirname, "..", config), "utf8"),
		);
		if (config === "tsconfig.base.json") {
			value.compilerOptions.typeRoots = [
				resolve(__dirname, "../node_modules/@types"),
			];
		}
		writeFileSync(join(root, config), JSON.stringify(value));
	}
	mkdirSync(join(root, "src/modules"), { recursive: true });
	mkdirSync(join(root, "src/scripts"), { recursive: true });
	writeFileSync(
		join(root, "src/modules/invalid.ts"),
		'const moduleValue: number = "type error";',
	);
	writeFileSync(
		join(root, "src/scripts/background.ts"),
		"const runtimeValue = 1;",
	);
	writeFileSync(join(root, "build.ts"), "const buildValue = 1;");
	const result = spawnSync("npm", ["run", "typecheck"], {
		cwd: root,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${resolve(__dirname, "../node_modules/.bin")}${delimiter}${process.env.PATH || ""}`,
		},
	});
	expect(result.status).not.toBe(0);
	expect(result.stdout).toContain("src/modules/invalid.ts(1,7): error TS2322");
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
