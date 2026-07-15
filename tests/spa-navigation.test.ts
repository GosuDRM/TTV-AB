import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const g = globalThis as Record<string, unknown>;

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/init.js");
});

beforeEach(() => {
	window.dispatchEvent(new Event("pagehide"));
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

describe("_hookSpaNavigation", () => {
	it("reinstalls history hooks after BFCache restore", () => {
		const calls: unknown[] = [];
		g._syncPagePlaybackContext = (options: unknown) => {
			calls.push(options);
			return null;
		};

		T<() => void>("_hookSpaNavigation")();

		history.pushState(null, "", "/firstchannel");
		expect(calls).toEqual([{ broadcast: true }]);

		window.dispatchEvent(new Event("pagehide"));
		history.pushState(null, "", "/unhookedchannel");
		expect(calls).toHaveLength(1);

		window.dispatchEvent(new Event("pageshow"));
		expect(calls).toHaveLength(2);

		history.replaceState(null, "", "/restoredchannel");
		expect(calls).toEqual([
			{ broadcast: true },
			{ broadcast: true },
			{ broadcast: true },
		]);
	});
});

describe("_collectPageLogEntries", () => {
	let savedCapture: unknown;

	beforeEach(() => {
		savedCapture = g._captureIndependentVideoAdDiagnostics;
		g.__TTVAB_LOGS__ = [{ t: 1, l: "info", m: "existing" }];
	});

	afterEach(() => {
		g._captureIndependentVideoAdDiagnostics = savedCapture;
		delete g.__TTVAB_LOGS__;
	});

	it("takes a live independent-video snapshot before exporting the buffer", () => {
		g._captureIndependentVideoAdDiagnostics = () => {
			(g.__TTVAB_LOGS__ as unknown[]).push({
				t: 2,
				l: "info",
				m: "Independent video advertisement log snapshot: <video>",
			});
		};

		const entries = T<() => Array<{ m: string }>>("_collectPageLogEntries")();

		expect(entries.map((entry) => entry.m)).toEqual([
			"existing",
			"Independent video advertisement log snapshot: <video>",
		]);
	});
});

describe("deferred init after landing on a clip page", () => {
	let savedInit: unknown;
	let savedLog: unknown;

	beforeEach(() => {
		savedInit = g._init;
		savedLog = g._log;
		g._log = () => {};
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		g._init = savedInit;
		g._log = savedLog;
		history.replaceState(null, "", "/");
	});

	it("initializes once the SPA leaves the clip route, exactly once", () => {
		const initCalls: number[] = [];
		g._init = () => initCalls.push(1);
		history.replaceState(null, "", "/somechannel/clip/FunnyMoment");
		expect(T<() => boolean>("_isClipEditorContext")()).toBe(true);

		T<() => void>("_deferInitUntilClipContextLeft")();
		vi.advanceTimersByTime(3000);
		expect(initCalls).toHaveLength(0);

		history.replaceState(null, "", "/somechannel");
		vi.advanceTimersByTime(300);
		expect(initCalls).toHaveLength(1);

		vi.advanceTimersByTime(5000);
		expect(initCalls).toHaveLength(1);
	});
});
