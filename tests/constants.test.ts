import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	g.globalThis = g;

	const js = readFileSync(
		resolve(__dirname, "../dist/src/modules/constants.js"), "utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const _C = /m, "globalThis._C = ");
	new Function("globalThis", js)(globalThis);
});

describe("_C constants", () => {
	const C = () => g._C as Record<string, unknown>;

	it("has valid version", () => {
		expect(C().VERSION).toBe("7.0.1");
	});

	it("has positive INTERNAL_VERSION", () => {
		expect(Number(C().INTERNAL_VERSION)).toBeGreaterThan(0);
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
