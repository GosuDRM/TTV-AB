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
		`${javascript.slice(start, end)}\nglobalThis._createPopupToggleController = _createPopupToggleController;\nglobalThis._createInfoModal = _createInfoModal;`,
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
			adSpoofingInfoLabel: string;
			autoplayBackupInfoLabel: string;
			adTimerInfoLabel: string;
			adTimerDesc: string;
			adTimerDetails: string;
			adTimerFootnote: string;
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
	it.each([undefined, false, null, "true", 1])(
		"enables fallback by default while respecting an explicit false value: %s",
		(value) => {
			const harness = makeHarness();
			harness.controller.start();
			harness.reads[0].finish({ ttvAutoplayBackupEnabled: value });
			const enabled = value !== false;
			expect(harness.controller.getSnapshot().values.autoplayBackup).toBe(
				enabled,
			);
			expect(harness.controller.write("autoplayBackup", !enabled)).toBe(true);
			harness.writes[0].finish(null);
			expect(harness.controller.getSnapshot().values.autoplayBackup).toBe(
				!enabled,
			);
		},
	);

	it("preserves saved choices that differ from the new defaults", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({
			ttvAutoplayBackupEnabled: false,
			ttvAdTimerEnabled: false,
		});
		expect(harness.controller.getSnapshot().values).toMatchObject({
			autoplayBackup: false,
			adTimer: false,
		});
		expect(harness.writes).toEqual([]);
	});

	it("disables the timer by default, saves its setting, and preserves newer changes", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});
		expect(harness.controller.getSnapshot().values.adTimer).toBe(false);
		expect(harness.controller.write("adTimer", true)).toBe(true);
		expect(harness.writes[0]).toEqual(
			expect.objectContaining({
				storageKey: "ttvAdTimerEnabled",
				enabled: true,
			}),
		);
		harness.controller.applyStorageChanges({
			ttvAdTimerEnabled: { newValue: false },
		});
		harness.writes[0].finish(null);
		expect(harness.controller.getSnapshot().values.adTimer).toBe(false);
		harness.controller.applyStorageChanges({
			ttvAdTimerEnabled: { newValue: true },
			ttvAdblockEnabled: { newValue: false },
		});
		expect(harness.controller.getSnapshot().values.adTimer).toBe(true);
		expect(harness.controller.getSnapshot().available.adTimer).toBe(false);
		expect(harness.controller.write("adTimer", false)).toBe(false);
		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { newValue: true },
		});
		expect(harness.controller.getSnapshot().values.adTimer).toBe(true);
		expect(harness.controller.getSnapshot().available.adTimer).toBe(true);
		harness.controller.applyStorageChanges({
			ttvAdTimerEnabled: { newValue: undefined },
		});
		expect(harness.controller.getSnapshot().values.adTimer).toBe(false);
	});

	it("serializes timer writes and ignores an older completion after the next toggle", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});
		expect(harness.controller.write("adTimer", true)).toBe(true);
		expect(harness.controller.getSnapshot().available.adTimer).toBe(false);
		expect(harness.controller.write("adTimer", false)).toBe(false);
		expect(harness.writes).toHaveLength(1);
		harness.controller.applyStorageChanges({
			ttvAdTimerEnabled: { newValue: true },
		});
		expect(harness.controller.write("adTimer", false)).toBe(true);
		harness.writes[0].finish("late failure");
		expect(harness.controller.getSnapshot().values.adTimer).toBe(false);
		expect(harness.controller.getSnapshot().pending.adTimer).toBe(true);
		expect(harness.writeErrors).toEqual([]);
		harness.writes[1].finish(null);
		expect(harness.controller.getSnapshot().values.adTimer).toBe(false);
		expect(harness.controller.getSnapshot().available.adTimer).toBe(true);
		expect(harness.successes).toEqual([
			{ name: "adTimer", enabled: true },
			{ name: "adTimer", enabled: false },
		]);
	});

	it("confirms a pending write when its own storage change arrives first", () => {
		vi.useFakeTimers();
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({});
		harness.controller.write("adSpoofing", false);

		harness.controller.applyStorageChanges({
			ttvAdSpoofingEnabled: { newValue: false },
		});
		expect(harness.successes).toEqual([{ name: "adSpoofing", enabled: false }]);
		expect(harness.controller.getSnapshot().pending.adSpoofing).toBe(false);

		harness.writes[0].finish(null);
		vi.advanceTimersByTime(5000);
		expect(harness.successes).toHaveLength(1);
		expect(harness.reads).toHaveLength(1);
	});

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
					adTimer: false,
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
					adTimer: false,
					turbo: false,
				},
				available: {
					adblock: true,
					adSpoofing: false,
					autoplayBackup: false,
					adTimer: false,
					turbo: true,
				},
			}),
		);
	});

	it("restores fallback on and timer off when their settings are removed", () => {
		const harness = makeHarness();
		harness.controller.start();
		harness.reads[0].finish({
			ttvAdblockEnabled: false,
			ttvAdSpoofingEnabled: false,
			ttvAutoplayBackupEnabled: false,
			ttvAdTimerEnabled: true,
			ttvTurboMode: true,
		});

		harness.controller.applyStorageChanges({
			ttvAdblockEnabled: { oldValue: false, newValue: undefined },
			ttvAdSpoofingEnabled: { oldValue: false, newValue: undefined },
			ttvAutoplayBackupEnabled: { oldValue: false, newValue: undefined },
			ttvAdTimerEnabled: { oldValue: true, newValue: undefined },
			ttvTurboMode: { oldValue: true, newValue: undefined },
		});

		expect(harness.controller.getSnapshot().values).toEqual({
			adblock: true,
			adSpoofing: true,
			autoplayBackup: true,
			adTimer: false,
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
					adTimer: false,
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
			adTimer: false,
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
			adTimer: false,
			turbo: true,
		});

		harness.writes[0].finish(null);
		expect(harness.controller.getSnapshot().available).toEqual({
			adblock: true,
			adSpoofing: true,
			autoplayBackup: true,
			adTimer: true,
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
			adTimer: false,
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
					adTimer: false,
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
			"adTimerToggle",
			"turboModeToggle",
		]) {
			expect(html).toMatch(
				new RegExp(`<input[^>]+id="${id}"[^>]+disabled[^>]*>`),
			);
		}
		expect(
			html.match(/<input[^>]+id="autoplayBackupToggle"[^>]*>/)?.[0],
		).toMatch(/\bchecked\b/);
		expect(html.match(/<input[^>]+id="adTimerToggle"[^>]*>/)?.[0]).not.toMatch(
			/\bchecked\b/,
		);
		expect(source).toMatch(
			/autoplayBackupToggle\.setAttribute\([\s\S]*?String\(t\.autoplayBackup \?\? "Low Quality Fallback"\)/,
		);
		expect(source).toContain("if (!setStoredLanguage(lang)) {");
		expect(source).toContain("nextSelector.value = selectedLanguage;");
		expect(source).toContain("if (setStoredTheme(theme)) {");
		expect(source).toContain(
			'popupRoot.classList.toggle("turbo-mode", isActive);',
		);
		expect(source).toContain("turboStatsShell.inert = isActive;");
		expect(source).toContain('translations.reportBugLabel ?? "Report a bug."');
		expect(source).not.toMatch(
			/turboModeEnabled[\s\S]{0,120}translations\.logDialogGenerate/,
		);
		expect(html).not.toContain("html.turbo-mode .report-bug");
		expect(html).not.toContain(
			'html[data-theme="retro"].turbo-mode .report-bug',
		);
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
		expect(bodyRule).not.toContain("min-height");
		expect(bodyRule).not.toContain("max-height: 100vh");
		expect(bodyRule).not.toContain("overflow-y: auto");
		expect(html).toMatch(
			/html\.log-export-page body\s*\{[\s\S]*?min-height:\s*100vh;/,
		);
	});

	it("keeps the v17.0.0 Turbo motion without a stale Firefox compositor frame", () => {
		const html = readFileSync(
			resolve(__dirname, "../src/popup/popup.html"),
			"utf8",
		);
		const source = readFileSync(
			resolve(__dirname, "../src/popup/popup.ts"),
			"utf8",
		);
		const turboBaseRule = html.match(
			/\n {8}\.turbo-collapsible \{([\s\S]*?)\n {8}\}/,
		)?.[1];
		const turboActiveRule = html.match(
			/html\.turbo-mode \.turbo-collapsible \{([\s\S]*?)\n {8}\}/,
		)?.[1];
		const turboSettledRule = html.match(
			/html\.turbo-mode\.turbo-layout-collapsed \.turbo-collapsible \{([\s\S]*?)\n {8}\}/,
		)?.[1];

		expect(turboBaseRule).toContain(
			"transition: grid-template-rows 0.38s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease, transform 0.38s ease;",
		);
		expect(turboBaseRule).toContain("overflow: hidden;");
		expect(turboBaseRule).not.toContain("will-change");
		expect(turboBaseRule).toContain("transform: translateY(0);");
		expect(turboActiveRule).toContain("grid-template-rows: 0fr;");
		expect(turboActiveRule).toContain("transform: translateY(-8px);");
		expect(turboActiveRule).not.toContain("display: none;");
		expect(turboSettledRule).toContain("display: none;");
		expect(source).toContain(
			'turboStatsShell.addEventListener("transitionend", (event) => {',
		);
		expect(source).toContain('event.propertyName !== "grid-template-rows"');
		expect(source).toContain("settleTurboLayout(turboLayoutGeneration);");
		expect(source).toContain("requestAnimationFrame(() => {");
		expect(source).toContain("generation !== turboLayoutGeneration");
		expect(source).toContain("const collapseDelay = window.matchMedia(");
		expect(source).toContain("? 0");
		expect(source).toContain(": 440;");
		expect(source).toContain(
			'document.documentElement.classList.add("turbo-layout-collapsed")',
		);
		expect(source).toContain(
			'popupRoot.classList.remove("turbo-layout-collapsed")',
		);
		expect(source).toContain("turboStatsShell.getBoundingClientRect();");
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

describe("popup info dialogs", () => {
	function makeModal(onClose: ((confirmed: boolean) => void) | null = null) {
		document.body.innerHTML = `
			<button id="opener">toggle</button>
			<button id="icon" aria-expanded="false">i</button>
			<div id="overlay" hidden><div id="box"><button id="close">Got it</button></div></div>`;
		const byId = (id: string) => document.getElementById(id) as HTMLElement;
		const create = g._createInfoModal as (
			icon: HTMLElement,
			overlay: HTMLElement,
			close: HTMLElement,
			onClose?: ((confirmed: boolean) => void) | null,
		) => {
			open: (opener?: HTMLElement) => void;
			close: () => void;
			isOpen: () => boolean;
		};
		const modal = create(byId("icon"), byId("overlay"), byId("close"), onClose);
		return { modal, byId };
	}

	it("opens from the info button, keeps focus on the dialog, and returns it", () => {
		const closes: boolean[] = [];
		const { modal, byId } = makeModal((confirmed) => closes.push(confirmed));
		byId("icon").click();
		expect(modal.isOpen()).toBe(true);
		expect(byId("overlay").classList.contains("visible")).toBe(true);
		expect(byId("icon").getAttribute("aria-expanded")).toBe("true");
		expect(document.activeElement).toBe(byId("close"));
		const tab = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		byId("close").dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(byId("close"));
		byId("close").click();
		expect(modal.isOpen()).toBe(false);
		expect(byId("icon").getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(byId("icon"));
		expect(closes).toEqual([true]);
	});

	it("cancels on an outside click or close() and returns focus to the opener", () => {
		const closes: boolean[] = [];
		const { modal, byId } = makeModal((confirmed) => closes.push(confirmed));
		modal.open(byId("opener"));
		byId("box").click();
		expect(modal.isOpen()).toBe(true);
		byId("overlay").click();
		expect(modal.isOpen()).toBe(false);
		expect(document.activeElement).toBe(byId("opener"));
		modal.open(byId("opener"));
		modal.close();
		expect(document.activeElement).toBe(byId("opener"));
		byId("icon").click();
		modal.close();
		expect(document.activeElement).toBe(byId("icon"));
		expect(closes).toEqual([false, false, false]);
	});

	it("marks every info button and dialog for assistive technology and localizes its label", () => {
		const { html, translations } = loadPopupExplanations();
		for (const [name, labelKey] of [
			["adSpoofing", "adSpoofingInfoLabel"],
			["autoplayBackup", "autoplayBackupInfoLabel"],
			["adTimer", "adTimerInfoLabel"],
			["turboMode", "turboModeInfoLabel"],
		] as const) {
			expect(html).toMatch(
				new RegExp(
					`<button type="button" class="info-icon" id="${name}InfoIcon" aria-label="[^"]+"\\s+aria-haspopup="dialog" aria-controls="${name}Tooltip" aria-expanded="false">i</button>`,
				),
			);
			expect(html).toContain(
				`<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="${name}ModalTitle">`,
			);
			expect(html).toContain(`<strong id="${name}ModalTitle"`);
			for (const translation of Object.values(translations))
				expect(translation[labelKey].trim()).not.toBe("");
		}
		expect(html).not.toMatch(/<span class="info-icon"/);
	});

	it("stops every popup animation when reduced motion is requested", () => {
		const { html } = loadPopupExplanations();
		const css = (html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "").replace(
			/\/\*[\s\S]*?\*\//g,
			"",
		);
		const normalize = (selector: string) =>
			selector.replace(/\s+/g, " ").trim();
		const reduced = new Set<string>();
		const animated = new Set<string>();
		let depth = 0;
		let inReduced = false;
		for (const match of css.matchAll(/([^{}]*)\{([^{}]*)\}|([^{}]*)\{|\}/g)) {
			if (match[3] !== undefined) {
				depth++;
				if (match[3].includes("prefers-reduced-motion: reduce"))
					inReduced = true;
				continue;
			}
			if (match[0] === "}") {
				depth--;
				if (depth === 0) inReduced = false;
				continue;
			}
			const selectors = match[1].split(",").map(normalize);
			const body = match[2];
			if (selectors[0].startsWith("@") || /^(from|to|\d+%)/.test(selectors[0]))
				continue;
			if (inReduced && /animation:\s*none/.test(body))
				for (const selector of selectors) reduced.add(selector);
			else if (!inReduced && /animation:\s*(?!none)[\w-]/.test(body))
				for (const selector of selectors) animated.add(selector);
		}
		expect(animated.size).toBeGreaterThan(15);
		expect([...animated].filter((selector) => !reduced.has(selector))).toEqual(
			[],
		);
	});

	it("lets every dialog scroll and shows a focus ring on its close button and the language selector", () => {
		const { html } = loadPopupExplanations();
		const rule = (selector: string) =>
			html.match(
				new RegExp(
					`\\n {8}${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`,
				),
			)?.[1] ?? "";
		expect(rule(".modal-box")).toContain("max-height: calc(100vh - 32px);");
		expect(rule(".modal-box")).toContain("overflow-y: auto;");
		expect(html).not.toContain(":where(#adTimerTooltip) .modal-box");
		for (const selector of [
			".modal-close:focus-visible",
			".lang-selector:focus-visible",
		])
			expect(rule(selector)).toContain(
				"outline: 2px solid rgba(145, 70, 255, 0.85);",
			);
	});
});

describe("popup setting explanations", () => {
	it("describes the optional timer as off by default without an elapsed label", () => {
		const { html, translations } = loadPopupExplanations();
		const english = translations.en;
		expect(english.adTimerDetails).toContain("Off by default.");
		for (const text of [
			english.adTimerDesc,
			english.adTimerDetails,
			english.adTimerFootnote,
		]) {
			expect(text).not.toMatch(/elapsed?/i);
			expect(html).toContain(text);
		}
	});

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
		expect(english.adSpoofingDesc).toContain(
			"outside midrolls requests the ad's segments in the background",
		);
		expect(english.adSpoofingFootnote).toContain(
			"does not block ads by itself",
		);
		expect(english.adSpoofingFootnote).toContain(
			"Turning it off stops only these requests",
		);
		expect(english.adSpoofingFootnote).not.toMatch(/signals stop/);
		expect(english.adSpoofingFootnote).toContain("ad blocking keeps working");
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

		expect(english.autoplayBackupDesc).toContain("On by default.");
		expect(english.autoplayBackupDesc).toContain("usually at 360p");
		expect(english.autoplayBackupDesc).toContain(
			"switches to a verified higher-quality backup without restarting the player",
		);
		expect(english.autoplayBackupDesc).toContain(
			"If the break ends at 360p, the player restarts once",
		);
		expect(english.autoplayBackupDesc).not.toMatch(/autoplay/i);
		expect(english.autoplayBackupWarning).toContain(
			"normal-quality sources are tried first",
		);
		expect(english.autoplayBackupWarning).toContain(
			"If none is ad-free during a preroll or midroll",
		);
		expect(english.autoplayBackupWarning).toContain(
			"low-quality stream can still play temporarily",
		);
		expect(english.autoplayBackupWarning).toContain(
			"while higher quality is checked",
		);
		expect(english.autoplayBackupWarning).toContain(
			"Ad breaks can take a few seconds longer to show video.",
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
