import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;

type ToggleSnapshot = {
	ready: boolean;
	values: Record<string, boolean>;
	pending: Record<string, boolean>;
	available: Record<string, boolean>;
};

type ToggleController = {
	applyStorageChanges: (changes: Record<string, unknown>) => boolean;
	getSnapshot: () => ToggleSnapshot;
	refresh: () => void;
	start: () => boolean;
	write: (name: string, enabled: boolean) => boolean;
};

type ReadEntry = {
	keys: string[];
	finish: (
		result: Record<string, unknown> | null,
		error?: string | null,
	) => void;
};

type WriteEntry = {
	storageKey: string;
	enabled: boolean;
	finish: (error?: string | null) => void;
};

function loadToggleController() {
	const source = readFileSync(
		resolve(__dirname, "../src/popup/popup.ts"),
		"utf8",
	);
	const javascript = transpileModule(source, {
		compilerOptions: {
			target: ScriptTarget.ES2022,
			module: ModuleKind.None,
		},
	}).outputText;
	const start = javascript.indexOf("const _POPUP_TOGGLE_NAMES");
	const end = javascript.indexOf(
		'document.addEventListener("DOMContentLoaded"',
	);
	if (start < 0 || end <= start) throw new Error("toggle controller not found");
	new Function(
		"globalThis",
		`${javascript.slice(start, end)}\nglobalThis._createPopupToggleController = _createPopupToggleController;`,
	)(globalThis);
}

function loadPopupExplanations() {
	const html = readFileSync(
		resolve(__dirname, "../src/popup/popup.html"),
		"utf8",
	);
	const source = readFileSync(
		resolve(__dirname, "../src/popup/translations.ts"),
		"utf8",
	);
	const javascript = transpileModule(source, {
		compilerOptions: {
			target: ScriptTarget.ES2022,
			module: ModuleKind.None,
		},
	}).outputText;
	const translations = new Function(
		`${javascript}\nreturn TRANSLATIONS;`,
	)() as Record<
		string,
		{
			adSpoofingDesc: string;
			adSpoofingFootnote: string;
			autoplayBackupDesc: string;
			autoplayBackupWarning: string;
			turboMode: string;
			turboModeEnabled: string;
			turboModeDisabled: string;
		}
	>;
	return { html, source, translations };
}

function makeHarness() {
	const reads: ReadEntry[] = [];
	const writes: WriteEntry[] = [];
	const renders: ToggleSnapshot[] = [];
	const successes: Array<{ name: string; enabled: boolean }> = [];
	const readErrors: Array<{ error: string; attempt: number }> = [];
	const writeErrors: Array<{ name: string; error: string }> = [];
	const create = g._createPopupToggleController as (options: {
		read: (keys: string[], finish: ReadEntry["finish"]) => void;
		write: (
			storageKey: string,
			enabled: boolean,
			finish: WriteEntry["finish"],
		) => void;
		render: (snapshot: ToggleSnapshot) => void;
		onReadError: (error: string, attempt: number) => void;
		onWriteError: (name: string, error: string) => void;
		onWriteSuccess: (name: string, enabled: boolean) => void;
	}) => ToggleController;
	const controller = create({
		read(keys, finish) {
			reads.push({ keys, finish });
		},
		write(storageKey, enabled, finish) {
			writes.push({ storageKey, enabled, finish });
		},
		render(snapshot) {
			renders.push(snapshot);
		},
		onReadError(error, attempt) {
			readErrors.push({ error, attempt });
		},
		onWriteError(name, error) {
			writeErrors.push({ name, error });
		},
		onWriteSuccess(name, enabled) {
			successes.push({ name, enabled });
		},
	});
	return {
		controller,
		reads,
		writes,
		renders,
		successes,
		readErrors,
		writeErrors,
	};
}

beforeAll(loadToggleController);

afterEach(() => {
	vi.useRealTimers();
});

describe("popup toggle authority", () => {
	it("keeps controls unavailable and preserves events newer than the initial read", () => {
		const harness = makeHarness();

		expect(harness.controller.start()).toBe(true);
		expect(harness.renders.at(-1)).toEqual(
			expect.objectContaining({
				ready: false,
				available: {
					adblock: false,
					adSpoofing: false,
					autoplayBackup: false,
					turbo: false,
				},
			}),
		);

		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { oldValue: true, newValue: false },
		});
		harness.reads[0].finish({
			ttvAdblockEnabled: true,
			ttvAdSpoofingEnabled: false,
		});

		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				ready: true,
				values: {
					adblock: false,
					adSpoofing: false,
					autoplayBackup: true,
					turbo: false,
				},
				available: {
					adblock: true,
					adSpoofing: false,
					autoplayBackup: false,
					turbo: true,
				},
			}),
		);
	});

	it("restores playback toggles by default while Turbo remains opt-in", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({
			ttvAdblockEnabled: false,
			ttvAdSpoofingEnabled: false,
			ttvAutoplayBackupEnabled: false,
			ttvTurboMode: true,
		});

		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { oldValue: false, newValue: undefined },
			ttvAdSpoofingEnabled: { oldValue: false, newValue: undefined },
			ttvAutoplayBackupEnabled: { oldValue: false, newValue: undefined },
			ttvTurboMode: { oldValue: true, newValue: undefined },
		});

		expect(harness.controller.getSnapshot().values).toEqual({
			adblock: true,
			adSpoofing: true,
			autoplayBackup: true,
			turbo: false,
		});
	});

	it("keeps Turbo available when ad blocking is off and writes only its UI key", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({ ttvAdblockEnabled: false });

		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				values: expect.objectContaining({ turbo: false }),
				available: expect.objectContaining({
					adblock: true,
					adSpoofing: false,
					autoplayBackup: false,
					turbo: true,
				}),
			}),
		);
		expect(harness.controller.write("turbo", true)).toBe(true);
		expect(harness.writes[0]).toEqual(
			expect.objectContaining({
				storageKey: "ttvTurboMode",
				enabled: true,
			}),
		);
	});

	it("keeps an external update authoritative over a stale write callback", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});

		expect(harness.controller.write("autoplayBackup", false)).toBe(true);
		expect(harness.writes[0]).toEqual(
			expect.objectContaining({
				storageKey: "ttvAutoplayBackupEnabled",
				enabled: false,
			}),
		);
		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { newValue: false },
			ttvAutoplayBackupEnabled: { newValue: true },
		});
		expect(harness.controller.getSnapshot().pending.autoplayBackup).toBe(false);
		harness.writes[0].finish(null);

		const snapshot = harness.controller.getSnapshot();
		expect(snapshot.values).toEqual({
			adblock: false,
			adSpoofing: true,
			autoplayBackup: true,
			turbo: false,
		});
		expect(snapshot.available.autoplayBackup).toBe(false);
		expect(harness.successes).toEqual([]);
	});

	it("releases a pending control from authoritative storage and clears its timeout", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});

		harness.controller.write("adSpoofing", false);
		expect(harness.controller.getSnapshot().pending.adSpoofing).toBe(true);

		harness.controller.applyStorageChanges({
			ttvAdSpoofingEnabled: { newValue: true },
		});
		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				values: expect.objectContaining({ adSpoofing: true }),
				pending: expect.objectContaining({ adSpoofing: false }),
				available: expect.objectContaining({ adSpoofing: true }),
			}),
		);

		vi.advanceTimersByTime(5000);
		expect(harness.reads).toHaveLength(1);
		harness.writes[0].finish(null);
		expect(harness.successes).toEqual([]);
	});

	it("times out an unacknowledged write and rereads authoritative state", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});

		harness.controller.write("adblock", false);
		vi.advanceTimersByTime(1000);

		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				ready: false,
				pending: expect.objectContaining({ adblock: false }),
			}),
		);
		expect(harness.writeErrors).toEqual([
			{ name: "adblock", error: "Settings write timed out" },
		]);
		expect(harness.reads).toHaveLength(2);

		harness.writes[0].finish(null);
		harness.reads[1].finish({ ttvAdblockEnabled: true });
		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				ready: true,
				values: expect.objectContaining({ adblock: true }),
			}),
		);
		expect(harness.successes).toEqual([]);
	});

	it("keeps child controls gated while enabling the master is pending", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({ ttvAdblockEnabled: false });

		harness.controller.write("adblock", true);
		expect(harness.controller.getSnapshot().available).toEqual({
			adblock: false,
			adSpoofing: false,
			autoplayBackup: false,
			turbo: true,
		});

		harness.writes[0].finish(null);
		expect(harness.controller.getSnapshot().available).toEqual({
			adblock: true,
			adSpoofing: true,
			autoplayBackup: true,
			turbo: true,
		});
	});

	it("disables all controls after a failed write until a fresh read resolves", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});
		harness.controller.write("adblock", false);

		harness.writes[0].finish("storage unavailable");

		expect(harness.controller.getSnapshot().ready).toBe(false);
		expect(harness.controller.getSnapshot().available).toEqual({
			adblock: false,
			adSpoofing: false,
			autoplayBackup: false,
			turbo: false,
		});
		expect(harness.writeErrors).toEqual([
			{ name: "adblock", error: "storage unavailable" },
		]);
		expect(harness.reads).toHaveLength(2);

		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { newValue: false },
		});
		harness.reads[1].finish({ ttvAdblockEnabled: true });

		expect(harness.controller.getSnapshot().values.adblock).toBe(false);
		expect(harness.controller.getSnapshot().available.adSpoofing).toBe(false);
	});

	it("keeps storage changes provisional until an authoritative read succeeds", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();

		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { newValue: false },
			ttvAdSpoofingEnabled: { newValue: false },
			ttvAutoplayBackupEnabled: { newValue: false },
		});

		expect(harness.controller.getSnapshot()).toEqual(
			expect.objectContaining({
				ready: false,
				values: {
					adblock: false,
					adSpoofing: false,
					autoplayBackup: false,
					turbo: false,
				},
			}),
		);

		harness.reads[0].finish(null);
		expect(harness.readErrors).toEqual([
			{ error: "Storage returned no settings", attempt: 1 },
		]);
		expect(harness.controller.getSnapshot().ready).toBe(false);
		expect(vi.getTimerCount()).toBe(1);
	});

	it("uses one slow retry until a delayed settings read succeeds", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();

		harness.reads[0].finish(null, "failure 1");
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(100);
		harness.reads[1].finish(null, "failure 2");
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(300);
		harness.reads[2].finish(null, "failure 3");
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(1000);
		harness.reads[3].finish(null, "failure 4");
		expect(vi.getTimerCount()).toBe(1);

		vi.advanceTimersByTime(29999);
		expect(harness.reads).toHaveLength(4);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(1);
		expect(harness.reads).toHaveLength(5);
		expect(vi.getTimerCount()).toBe(1);

		harness.reads[4].finish(null, "failure 5");
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(30000);
		expect(harness.reads).toHaveLength(6);
		expect(vi.getTimerCount()).toBe(1);

		harness.reads[5].finish({
			ttvAdblockEnabled: true,
			ttvAdSpoofingEnabled: true,
			ttvAutoplayBackupEnabled: true,
		});
		expect(harness.controller.getSnapshot().ready).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(60000);

		expect(harness.reads).toHaveLength(6);
		expect(harness.readErrors.map((entry) => entry.attempt)).toEqual([
			1, 2, 3, 4, 5,
		]);
	});

	it("times out stalled reads and ignores their late callbacks", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();

		vi.advanceTimersByTime(1000);
		expect(harness.readErrors).toEqual([
			{ error: "Settings read timed out", attempt: 1 },
		]);
		expect(harness.controller.getSnapshot().ready).toBe(false);
		expect(vi.getTimerCount()).toBe(1);

		vi.advanceTimersByTime(100);
		expect(harness.reads).toHaveLength(2);
		expect(vi.getTimerCount()).toBe(1);
		harness.reads[0].finish({ ttvAdblockEnabled: false });
		expect(harness.controller.getSnapshot().ready).toBe(false);

		harness.reads[1].finish({ ttvAdblockEnabled: true });
		expect(harness.controller.getSnapshot().ready).toBe(true);
		expect(harness.controller.getSnapshot().values.adblock).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ships disabled controls and localizes the fallback control label", () => {
		const html = readFileSync(
			resolve(__dirname, "../src/popup/popup.html"),
			"utf8",
		);
		const source = readFileSync(
			resolve(__dirname, "../src/popup/popup.ts"),
			"utf8",
		);

		for (const id of [
			"enableToggle",
			"adSpoofingToggle",
			"autoplayBackupToggle",
			"turboModeToggle",
		]) {
			expect(html).toMatch(
				new RegExp(`<input[^>]+id="${id}"[^>]+disabled[^>]*>`),
			);
		}
		expect(source).toMatch(
			/autoplayBackupToggle\.setAttribute\([\s\S]*?String\(t\.autoplayBackup \?\? "Low Quality Fallback"\)/,
		);
		expect(source).toContain("if (!setStoredLanguage(lang)) {");
		expect(source).toContain("nextSelector.value = selectedLanguage;");
		expect(source).toContain("if (setStoredTheme(theme)) {");
		expect(source).toContain(
			'document.documentElement.classList.toggle("turbo-mode", isActive);',
		);
		expect(source).toContain("turboStatsShell.inert = isActive;");
		expect(html).toContain('id="themeToggle"');
		expect(html).toContain('id="langSelector"');
		expect(html).toContain('value="auto" id="langAutoOption"');
		expect(html).toContain('id="reportBugText"');
		expect(html).toMatch(
			/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.turbo-collapsible/,
		);
	});

	it("lets the toolbar popup use its intrinsic content height", () => {
		const html = readFileSync(
			resolve(__dirname, "../src/popup/popup.html"),
			"utf8",
		);
		const bodyRule = html.match(/\n {8}body \{([\s\S]*?)\n {8}\}/)?.[1];

		expect(bodyRule).toBeDefined();
		expect(bodyRule).not.toContain("max-height: 100vh");
		expect(bodyRule).not.toContain("overflow-y: auto");
	});

	it("compacts vertical gaps so constrained popups keep the locale footer visible", () => {
		const html = readFileSync(
			resolve(__dirname, "../src/popup/popup.html"),
			"utf8",
		);
		const narrowRules = html.match(
			/@media \(max-width: 319px\) \{([\s\S]*?)@media \(max-height: 620px\)/,
		)?.[1];
		const compactRules = html.match(
			/@media \(max-height: 620px\) \{([\s\S]*?)@media \(prefers-reduced-motion: reduce\)/,
		)?.[1];

		expect(narrowRules).toBeDefined();
		expect(narrowRules).toMatch(
			/\.footer\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?gap:\s*6px;/,
		);
		expect(narrowRules).toMatch(
			/\.footer\s*>\s*span\s*\{[\s\S]*?white-space:\s*nowrap;/,
		);
		expect(compactRules).toBeDefined();
		expect(compactRules).toMatch(
			/\.description-text\s*\{[\s\S]*?max-height:\s*2\.6em;[\s\S]*?overflow:\s*hidden;/,
		);
		expect(compactRules).toMatch(/\.status-card\s*\{\s*margin-bottom:\s*0;/);
		expect(compactRules).toMatch(/\.stats-toggle\s*\{\s*margin-top:\s*8px;/);
		expect(compactRules).toMatch(
			/\.footer\s*\{[\s\S]*?margin-top:\s*10px;[\s\S]*?padding-top:\s*8px;/,
		);
		expect(html).toContain('id="langSelector"');
	});
});

describe("popup setting explanations", () => {
	it("localizes Turbo state in every supported locale", () => {
		const { translations } = loadPopupExplanations();

		expect(Object.keys(translations)).toHaveLength(12);
		for (const translation of Object.values(translations)) {
			expect(translation.turboMode.trim()).not.toBe("");
			expect(translation.turboModeEnabled.trim()).not.toBe("");
			expect(translation.turboModeDisabled.trim()).not.toBe("");
		}
	});

	it("describes the telemetry separately from the ad-blocking behavior", () => {
		const { html, source, translations } = loadPopupExplanations();
		const english = translations.en;

		expect(english.adSpoofingDesc).toContain(
			"impression, progress, and completion events",
		);
		expect(english.adSpoofingDesc).toContain("without playing the ad");
		expect(english.adSpoofingFootnote).toContain("extra requests to Twitch");
		expect(english.adSpoofingFootnote).toContain(
			"does not block ads by itself",
		);
		expect(english.adSpoofingFootnote).toContain(
			"ad blocking keeps working normally",
		);
		expect(html).toContain(
			`data-i18n="adSpoofingDesc">${english.adSpoofingDesc}</p>`,
		);
		expect(html).toContain(
			`data-i18n="adSpoofingFootnote">${english.adSpoofingFootnote}</p>`,
		);
		expect(`${html}\n${source}`).not.toMatch(/channel points/i);
	});

	it("distinguishes the fast bridge from disabled-mode tradeoffs", () => {
		const { html, translations } = loadPopupExplanations();
		const english = translations.en;

		expect(english.autoplayBackupDesc).toContain(
			"fast, ad-free autoplay stream",
		);
		expect(english.autoplayBackupDesc).toContain("usually at 360p");
		expect(english.autoplayBackupDesc).toContain(
			"then check for a verified higher-quality backup",
		);
		expect(english.autoplayBackupDesc).toContain(
			"without reloading the player",
		);
		expect(english.autoplayBackupWarning).toContain(
			"skips new autoplay backups during normal Twitch playback",
		);
		expect(english.autoplayBackupWarning).toContain(
			"may take longer or briefly interrupt playback",
		);
		expect(english.autoplayBackupWarning).toContain(
			"may still be lower quality",
		);
		expect(english.autoplayBackupWarning).not.toMatch(/preview/i);
		expect(html).toContain(
			`data-i18n="autoplayBackupDesc">${english.autoplayBackupDesc}</p>`,
		);
		expect(html).toContain(
			`data-i18n="autoplayBackupWarning">${english.autoplayBackupWarning}</p>`,
		);
	});
});
