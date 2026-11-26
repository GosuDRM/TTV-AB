import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";

type StoreRelease = { latest: string; store: "chrome" | "firefox" };

type UpdateHelpers = {
	interval: number;
	retry: number;
	isNewer: (candidate: unknown, current: unknown) => boolean;
	firefoxRelease: (payload: unknown, browserVersion: unknown) => string | null;
	readStored: (
		value: unknown,
		installedVersion: string,
		now: number,
	) => { release: StoreRelease | null; due: boolean };
	check: (
		runtime: Record<string, unknown>,
		fetchImpl?: (...args: unknown[]) => Promise<unknown>,
	) => Promise<StoreRelease | null>;
};

let helpers: UpdateHelpers;

beforeAll(() => {
	const source = readFileSync(
		resolve(__dirname, "../src/popup/popup.ts"),
		"utf8",
	);
	const javascript = transpileModule(source, {
		compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
	}).outputText;
	const start = javascript.indexOf("const _UPDATE_CHECK_STORAGE_KEY");
	const end = javascript.indexOf(
		'document.addEventListener("DOMContentLoaded"',
	);
	if (start < 0 || end <= start) throw new Error("update helpers not found");
	helpers = new Function(
		`${javascript.slice(start, end)}
return {
	interval: _UPDATE_CHECK_INTERVAL_MS,
	retry: _UPDATE_CHECK_RETRY_MS,
	isNewer: _isNewerReleaseVersion,
	firefoxRelease: _getFirefoxAddonsRelease,
	readStored: _readStoredUpdateCheck,
	check: _checkStoreRelease,
};`,
	)() as UpdateHelpers;
});

function firefoxRuntime(version = "28.0.0", browserVersion = "162.0") {
	return {
		id: "{71e91189-9cd2-4e46-895d-bcc38f0053c4}",
		getManifest: () => ({ version }),
		getBrowserInfo: vi.fn(async () => ({ version: browserVersion })),
	};
}

function amoResponse(version: string, min = "142.0", ok = true) {
	return {
		ok,
		json: async () => ({
			current_version: {
				version,
				compatibility: { firefox: { min, max: "*" } },
			},
		}),
	};
}

describe("popup update check", () => {
	it("compares release versions numerically", () => {
		expect(helpers.isNewer("28.0.1", "28.0.0")).toBe(true);
		expect(helpers.isNewer("28.1.0", "28.0.9")).toBe(true);
		expect(helpers.isNewer("28.0.10", "28.0.9")).toBe(true);
		expect(helpers.isNewer("29", "28.9.9")).toBe(true);
		expect(helpers.isNewer("28.0.0", "28.0.0")).toBe(false);
		expect(helpers.isNewer("28.0", "28.0.0")).toBe(false);
		expect(helpers.isNewer("27.0.2", "28.0.0")).toBe(false);
		expect(helpers.isNewer("28.0.1-beta", "28.0.0")).toBe(false);
		expect(helpers.isNewer("28.0.1", "")).toBe(false);
	});

	it("ignores a store release the installed Firefox cannot run", () => {
		const payload = (min: string) => ({
			current_version: {
				version: "28.0.1",
				compatibility: { firefox: { min } },
			},
		});
		expect(helpers.firefoxRelease(payload("142.0"), "162.0")).toBe("28.0.1");
		expect(helpers.firefoxRelease(payload("163.0"), "162.0")).toBeNull();
		expect(helpers.firefoxRelease(payload("163.0"), "163.0a1")).toBe("28.0.1");
		expect(helpers.firefoxRelease({ current_version: {} }, "162.0")).toBeNull();
		expect(helpers.firefoxRelease(null, "162.0")).toBeNull();
	});

	it("checks again only after the interval, a version change, or the retry wait", () => {
		const now = 1_800_000_000_000;
		const record = {
			latest: "28.0.1",
			store: "firefox",
			installedVersion: "28.0.0",
			checkedAt: now - 60_000,
			attemptedAt: now - 60_000,
		};
		expect(helpers.readStored(record, "28.0.0", now)).toEqual({
			release: { latest: "28.0.1", store: "firefox" },
			due: false,
		});
		const old = now - helpers.interval;
		expect(
			helpers.readStored(
				{ ...record, checkedAt: old, attemptedAt: old },
				"28.0.0",
				now,
			).due,
		).toBe(true);
		expect(
			helpers.readStored(
				{ ...record, attemptedAt: now - helpers.retry },
				"28.0.1",
				now,
			),
		).toEqual({ release: { latest: "28.0.1", store: "firefox" }, due: true });
		expect(
			helpers.readStored({ attemptedAt: now - 60_000 }, "28.0.0", now),
		).toEqual({ release: null, due: false });
		expect(
			helpers.readStored({ attemptedAt: now - helpers.retry }, "28.0.0", now)
				.due,
		).toBe(true);
		expect(
			helpers.readStored(
				{ ...record, checkedAt: now + 60_000, attemptedAt: now + 60_000 },
				"28.0.0",
				now,
			).due,
		).toBe(true);
		expect(helpers.readStored(undefined, "28.0.0", now)).toEqual({
			release: null,
			due: true,
		});
		expect(
			helpers.readStored(
				{ ...record, store: "other", latest: "<b>" },
				"28.0.0",
				now,
			).release,
		).toBeNull();
	});

	it("reads Firefox releases from the add-on's public listing without cookies", async () => {
		const runtime = firefoxRuntime();
		const fetchImpl = vi.fn(async () => amoResponse("28.0.1"));
		await expect(helpers.check(runtime, fetchImpl)).resolves.toEqual({
			latest: "28.0.1",
			store: "firefox",
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://addons.mozilla.org/api/v5/addons/addon/%7B71e91189-9cd2-4e46-895d-bcc38f0053c4%7D/",
		);
		expect(init.credentials).toBe("omit");
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("reports the installed version when Firefox cannot run the newer release", async () => {
		const fetchImpl = vi.fn(async () => amoResponse("28.0.1", "170.0"));
		await expect(
			helpers.check(firefoxRuntime("28.0.0", "162.0"), fetchImpl),
		).resolves.toEqual({ latest: "28.0.0", store: "firefox" });
	});

	it("records nothing when the Firefox listing request fails", async () => {
		await expect(
			helpers.check(
				firefoxRuntime(),
				vi.fn(async () => amoResponse("28.0.1", "142.0", false)),
			),
		).resolves.toBeNull();
		await expect(
			helpers.check(
				firefoxRuntime(),
				vi.fn(async () => {
					throw new TypeError("NetworkError");
				}),
			),
		).rejects.toThrow("NetworkError");
	});

	it("asks the Chrome Web Store through the browser's own update check", async () => {
		const fetchImpl = vi.fn();
		const statuses = [
			{ status: "update_available", version: "28.0.1" },
			{ status: "no_update" },
			{ status: "throttled" },
			{ status: "update_available", version: "bogus" },
		];
		const runtime = {
			getManifest: () => ({
				version: "28.0.0",
				update_url: "https://clients2.google.com/service/update2/crx",
			}),
			requestUpdateCheck: vi.fn(async () => statuses.shift()),
		};
		await expect(helpers.check(runtime, fetchImpl)).resolves.toEqual({
			latest: "28.0.1",
			store: "chrome",
		});
		await expect(helpers.check(runtime, fetchImpl)).resolves.toEqual({
			latest: "28.0.0",
			store: "chrome",
		});
		await expect(helpers.check(runtime, fetchImpl)).resolves.toBeNull();
		await expect(helpers.check(runtime, fetchImpl)).resolves.toBeNull();
		expect(runtime.requestUpdateCheck).toHaveBeenCalledTimes(4);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("skips installs that no store updates", async () => {
		const runtime = {
			getManifest: () => ({ version: "28.0.1" }),
			requestUpdateCheck: vi.fn(),
		};
		await expect(helpers.check(runtime)).resolves.toBeNull();
		expect(runtime.requestUpdateCheck).not.toHaveBeenCalled();
		await expect(
			helpers.check({ getManifest: () => ({ version: "28.0.1" }) }),
		).resolves.toBeNull();
	});
});

describe("popup update notice markup", () => {
	const html = readFileSync(
		resolve(__dirname, "../src/popup/popup.html"),
		"utf8",
	);
	const translationsSource = readFileSync(
		resolve(__dirname, "../src/popup/translations.ts"),
		"utf8",
	);
	const translations = new Function(
		`${
			transpileModule(translationsSource, {
				compilerOptions: {
					target: ScriptTarget.ES2022,
					module: ModuleKind.None,
				},
			}).outputText
		}\nreturn TRANSLATIONS;`,
	)() as Record<string, Record<string, string>>;

	it("keeps the update badge hidden until a newer release is found", () => {
		expect(html).toMatch(
			/<button type="button" class="stable-badge update-badge" id="updateBadge"[^>]*aria-controls="updateTooltip"[^>]*hidden>/,
		);
		expect(html).toContain('id="stableBadge"');
		expect(html).toMatch(
			/<div class="modal-overlay" id="updateTooltip" hidden>/,
		);
	});

	it("localizes every update string with the version placeholder", () => {
		for (const [language, strings] of Object.entries(translations)) {
			for (const key of [
				"updateAvailable",
				"updateChromeDetails",
				"updateFirefoxDetails",
				"updateGotIt",
			]) {
				expect(strings[key], `${language}.${key}`).toBeTruthy();
			}
			expect(strings.updateTitle, language).toContain("{version}");
		}
	});
});
