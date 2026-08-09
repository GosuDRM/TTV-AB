import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const g = globalThis as Record<string, unknown>;
const runtimeMessages: Array<Record<string, unknown>> = [];

function loadBridge() {
	const js = readFileSync(
		resolve(__dirname, "../dist/src/scripts/bridge.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (\w+)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	g.chrome = {
		runtime: {
			id: "ttvab-test",
			lastError: null,
			onMessage: { addListener: () => {} },
			sendMessage: (
				message: Record<string, unknown>,
				callback: (response: unknown) => void,
			) => {
				runtimeMessages.push(message);
				callback({ ok: true, newUnlocks: [] });
			},
		},
		storage: {
			local: { get: () => {} },
			onChanged: { addListener: () => {} },
		},
	};
	loadBridge();
});

beforeEach(() => {
	runtimeMessages.length = 0;
	localStorage.clear();
});

function handlePageMessage(message: Record<string, unknown>) {
	return (
		g.handlePageBridgeMessage as (value: Record<string, unknown>) => unknown
	)(message);
}

function makeExitFlush() {
	return {
		flushId: "flush:test:page-exit-0001",
		createdAt: Date.now(),
		adsDelta: 0,
		channelDeltas: {},
		watchDeltas: { somestreamer: 7 },
	};
}

describe("page-exit counter journal lifecycle", () => {
	it("dispatches the exact journaled watch delta and confirms only after clearing it", () => {
		const flush = makeExitFlush();
		const storageKey = `ttvab_pending_counter_flush:${flush.flushId}`;
		localStorage.setItem(storageKey, JSON.stringify(flush));

		handlePageMessage({
			type: "ttvab-persist-counter-flush",
			detail: flush,
		});

		expect(runtimeMessages).toEqual([
			{
				type: "ttvab-persist-counters",
				detail: expect.objectContaining({
					flushId: flush.flushId,
					watchDeltas: { somestreamer: 7 },
				}),
			},
			{
				type: "ttvab-confirm-counter-flush",
				detail: { flushId: flush.flushId },
			},
		]);
		expect(localStorage.getItem(storageKey)).toBeNull();
	});

	it("leaves the flush unconfirmed when its journal cannot be removed", () => {
		const flush = makeExitFlush();
		const storageKey = `ttvab_pending_counter_flush:${flush.flushId}`;
		localStorage.setItem(storageKey, JSON.stringify(flush));
		const removeItem = vi
			.spyOn(localStorage, "removeItem")
			.mockImplementation(() => {
				throw new Error("storage unavailable");
			});

		handlePageMessage({
			type: "ttvab-persist-counter-flush",
			detail: flush,
		});

		expect(runtimeMessages).toHaveLength(1);
		expect(runtimeMessages[0]?.type).toBe("ttvab-persist-counters");
		expect(localStorage.getItem(storageKey)).not.toBeNull();
		removeItem.mockRestore();
	});
});
