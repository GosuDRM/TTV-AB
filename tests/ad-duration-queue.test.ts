import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	const js = readFileSync(
		resolve(__dirname, "../dist/src/modules/state.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
});

describe("pending measured-duration bridge records", () => {
	it("uses the ad cycle in the coalescing identity", () => {
		const identity = g._getPendingBridgeCounterIdentity as (
			message: unknown,
		) => string | null;
		const makeMessage = (cycleStartedAt: number) => ({
			type: "ttvab-ad-seconds",
			detail: {
				mediaKey: "live:somestreamer",
				cycleStartedAt,
				measurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15000,
						startDateMilliseconds: 1000,
					},
				],
			},
		});

		expect(identity(makeMessage(1000))).not.toBe(identity(makeMessage(2000)));
		expect(identity({ type: "ttvab-ad-seconds", detail: {} })).toBeNull();
	});

	it("coalesces duration records without duplicating a creative", () => {
		const merge = g._mergePendingBridgeCounterMessages as (
			target: Record<string, unknown>,
			incoming: Record<string, unknown>,
		) => boolean;
		const target = {
			type: "ttvab-ad-seconds",
			detail: {
				mediaKey: "live:somestreamer",
				cycleStartedAt: 1000,
				measurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15000,
						startDateMilliseconds: 1000,
					},
				],
			},
		};
		const incoming = {
			type: "ttvab-ad-seconds",
			detail: {
				mediaKey: "live:somestreamer",
				cycleStartedAt: 1000,
				measurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15000,
						startDateMilliseconds: 1000,
					},
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15000,
						startDateMilliseconds: 2000,
					},
					{ id: "stitched-ad-second", durationMilliseconds: 30000 },
				],
			},
		};

		expect(merge(target, incoming)).toBe(true);
		expect((target.detail as { measurements: unknown[] }).measurements).toEqual(
			[
				{
					id: "stitched-ad-first",
					durationMilliseconds: 15000,
					startDateMilliseconds: 1000,
				},
				{
					id: "stitched-ad-first",
					durationMilliseconds: 15000,
					startDateMilliseconds: 2000,
				},
				{ id: "stitched-ad-second", durationMilliseconds: 30000 },
			],
		);
	});

	it("keeps a second bounded chunk separate while the bridge is disconnected", () => {
		const send = g._sendBridgeMessage as (
			type: string,
			detail: Record<string, unknown>,
		) => boolean;
		g._bridgePort = null;
		g._pendingBridgeMessages = [];
		const makeMeasurements = (start: number, length: number) =>
			Array.from({ length }, (_, offset) => ({
				id: `stitched-ad-${start + offset}`,
				durationMilliseconds: 1000,
			}));
		const context = {
			mediaKey: "live:somestreamer",
			cycleStartedAt: 1000,
		};

		expect(
			send("ttvab-ad-seconds", {
				...context,
				measurements: makeMeasurements(0, 50),
			}),
		).toBe(false);
		expect(
			send("ttvab-ad-seconds", {
				...context,
				measurements: makeMeasurements(50, 10),
			}),
		).toBe(false);

		const pending = g._pendingBridgeMessages as Array<{
			detail: { measurements: unknown[] };
		}>;
		expect(pending).toHaveLength(2);
		expect(
			pending.map((message) => message.detail.measurements.length),
		).toEqual([50, 10]);
	});
});
