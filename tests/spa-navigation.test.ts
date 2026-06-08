import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

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
