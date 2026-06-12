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
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/logger.js");
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

describe("_log (worker-safe debug flag)", () => {
	const log = () => T<(msg: unknown, type?: string) => void>("_log");
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		g._debugLogging = false;
	});

	it("drops debug output without throwing when the flag is undeclared", () => {
		delete g._debugLogging;

		expect(() => log()("worker debug line", "debug")).not.toThrow();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("still emits non-debug output when the flag is undeclared", () => {
		delete g._debugLogging;

		expect(() => log()("worker info line", "info")).not.toThrow();
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("emits debug output once the flag is enabled", () => {
		g._debugLogging = true;

		log()("debug line", "debug");
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("suppresses debug output while the flag is declared but off", () => {
		g._debugLogging = false;

		log()("debug line", "debug");
		expect(logSpy).not.toHaveBeenCalled();
	});
});

describe("_log capture buffer", () => {
	const log = () => T<(msg: unknown, type?: string) => void>("_log");
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		delete (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		g._debugLogging = false;
		delete (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
	});

	function buffer(): Array<Record<string, unknown>> {
		const value = (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
		return Array.isArray(value) ? value : [];
	}

	it("records page-side entries with timestamp, level, and message", () => {
		const before = Date.now();
		log()("Ad blocked! Total: 7", "success");
		const entries = buffer();
		expect(entries.length).toBe(1);
		expect(entries[0].m).toBe("Ad blocked! Total: 7");
		expect(entries[0].l).toBe("success");
		expect(Number(entries[0].t)).toBeGreaterThanOrEqual(before);
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("does not record suppressed debug entries", () => {
		g._debugLogging = false;
		log()("hidden debug", "debug");
		expect(buffer().length).toBe(0);
	});

	it("records debug entries once debug logging is enabled", () => {
		g._debugLogging = true;
		log()("visible debug", "debug");
		expect(buffer().map((e) => e.m)).toContain("visible debug");
	});

	it("caps the buffer near 1000 entries instead of growing forever", () => {
		for (let i = 0; i < 1300; i++) {
			log()(`line ${i}`, "info");
		}
		const entries = buffer();
		expect(entries.length).toBeLessThanOrEqual(1200);
		expect(entries.length).toBeGreaterThanOrEqual(1000);
		expect(entries[entries.length - 1].m).toBe("line 1299");
	});

	it("recovers when the page clobbers the buffer global", () => {
		(globalThis as Record<string, unknown>).__TTVAB_LOGS__ = "corrupted";
		expect(() => log()("after corruption", "info")).not.toThrow();
		expect(buffer().map((e) => e.m)).toContain("after corruption");
	});
});
