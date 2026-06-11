import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	g.globalThis = g;

	const js = readFileSync(
		resolve(__dirname, "../dist/src/modules/constants.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const _C = /m, "globalThis._C = ");
	new Function("globalThis", js)(globalThis);
});

describe("_C constants", () => {
	const C = () => g._C as Record<string, unknown>;

	it("matches the package version", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(__dirname, "../package.json"), "utf8"),
		) as { version: string };
		expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(C().VERSION).toBe(pkg.version);
	});

	it("has positive INTERNAL_VERSION", () => {
		expect(Number(C().INTERNAL_VERSION)).toBeGreaterThan(0);
	});

	it("derives INTERNAL_VERSION from VERSION", () => {
		const parts = String(C().VERSION).match(/^(\d+)\.(\d+)\.(\d+)$/);
		expect(parts).not.toBeNull();
		const expected =
			Number(parts?.[1]) * 10000 +
			Number(parts?.[2]) * 100 +
			Number(parts?.[3]);
		expect(C().INTERNAL_VERSION).toBe(expected);
	});

	it("state seeding fallbacks match the tuned constants", () => {
		const stateJs = readFileSync(
			resolve(__dirname, "../dist/src/modules/state.js"),
			"utf8",
		);
		const pairs = [
			...stateJs.matchAll(/_C\.([A-Z0-9_]+)\s*\?\?\s*(\d+(?:\.\d+)?)/g),
		];
		expect(pairs.length).toBeGreaterThan(0);
		for (const [, key, fallback] of pairs) {
			expect({ key, fallback: Number(fallback) }).toEqual({
				key,
				fallback: Number(C()[key]),
			});
		}
	});

	it("has AD_SIGNIFIER", () => {
		expect(C().AD_SIGNIFIER).toBe("stitched");
	});

	it("has CLIENT_ID", () => {
		expect(typeof C().CLIENT_ID).toBe("string");
		expect((C().CLIENT_ID as string).length).toBeGreaterThan(10);
	});

	it("has at least 2 PLAYER_TYPES", () => {
		const types = C().PLAYER_TYPES as string[];
		expect(Array.isArray(types)).toBe(true);
		expect(types.length).toBeGreaterThanOrEqual(2);
	});

	it("FALLBACK_TYPE is in PLAYER_TYPES", () => {
		const types = C().PLAYER_TYPES as string[];
		expect(types).toContain(C().FALLBACK_TYPE);
	});

	it("timing constants are positive", () => {
		expect(Number(C().AD_END_GRACE_MS)).toBeGreaterThan(0);
		expect(Number(C().AD_END_MAX_WAIT_MS)).toBeGreaterThan(0);
		expect(Number(C().PLAYER_RELOAD_DEBOUNCE_MS)).toBeGreaterThan(0);
	});

	it("has LOG_STYLES", () => {
		const styles = C().LOG_STYLES as Record<string, unknown>;
		expect(typeof styles.prefix).toBe("string");
	});
});
