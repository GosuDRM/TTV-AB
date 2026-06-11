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
