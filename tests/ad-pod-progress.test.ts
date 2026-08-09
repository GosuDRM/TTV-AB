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

function T<T>(name: string): T {
	const value = g[name];
	if (typeof value !== "function") throw new Error(`${name} not loaded`);
	return value as T;
}

beforeAll(() => {
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
});

beforeEach(() => {
	T<(scope: typeof globalThis) => void>("_declareState")(globalThis);
});

describe("main-owned declared ad pod progress", () => {
	it("merges different workers onto one complete pod and seeds stream info", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const apply = T<
			(
				info: Record<string, unknown>,
				value: Record<string, unknown>,
			) => Record<string, unknown> | null
		>("_applyAdPodProgressToInfo");
		const context = {
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			expectedPodLength: 2,
			cycleStartedAt: 1000,
		};

		merge({ ...context, adIds: ["stitched-ad-1"] });
		const merged = merge({ ...context, adIds: ["stitched-ad-2"] });
		const info = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
		};
		apply(info, merged || {});

		expect(merged).toMatchObject({
			adIds: ["stitched-ad-1", "stitched-ad-2"],
			expectedPodLength: 2,
			cycleStartedAt: 1000,
		});
		expect([...info.ObservedAdPodIds]).toEqual([
			"stitched-ad-1",
			"stitched-ad-2",
		]);
		expect(info.ExpectedAdPodLength).toBe(2);
	});

	it("replaces an older cycle and ignores late progress from it", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const context = {
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			expectedPodLength: 2,
		};

		merge({ ...context, cycleStartedAt: 1000, adIds: ["old-ad"] });
		merge({ ...context, cycleStartedAt: 2000, adIds: ["new-ad-1"] });
		const result = merge({
			...context,
			cycleStartedAt: 1000,
			adIds: ["old-ad-2"],
		});

		expect(result).toMatchObject({
			adIds: ["new-ad-1"],
			cycleStartedAt: 2000,
		});
	});

	it("replaces an active pod when a replacement worker reports a newer exact cycle", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const state = g.__TTVAB_STATE__ as {
			CurrentAdMediaKey: string | null;
		};
		const context = {
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			expectedPodLength: 2,
		};
		state.CurrentAdMediaKey = "live:testchannel";

		merge({ ...context, cycleStartedAt: 1000, adIds: ["stitched-ad-1"] });
		const result = merge({
			...context,
			cycleStartedAt: 2000,
			adIds: ["stitched-ad-2"],
		});

		expect(result).toMatchObject({
			adIds: ["stitched-ad-2"],
			cycleStartedAt: 2000,
		});
	});

	it("clears only the requested media context", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const clear = T<(mediaKey: string) => boolean>("_clearAdPodProgress");
		merge({
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 1000,
			adIds: ["stitched-ad-1"],
		});
		merge({
			mediaType: "live",
			channelName: "otherchannel",
			mediaKey: "live:otherchannel",
			cycleStartedAt: 1000,
			adIds: ["stitched-ad-2"],
		});

		expect(clear("live:testchannel")).toBe(true);
		expect(clear("live:testchannel")).toBe(false);
		const state = g.__TTVAB_STATE__ as {
			AdPodProgressByMediaKey: Record<string, unknown>;
		};
		expect(state.AdPodProgressByMediaKey["live:testchannel"]).toBeUndefined();
		expect(state.AdPodProgressByMediaKey["live:otherchannel"]).toBeDefined();
	});

	it("clears surviving worker info before applying the next canonical cycle", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const apply = T<
			(
				info: Record<string, unknown>,
				value: Record<string, unknown>,
			) => Record<string, unknown> | null
		>("_applyAdPodProgressToInfo");
		const clear = T<(mediaKey: string) => boolean>("_clearAdPodProgress");
		const state = g.__TTVAB_STATE__ as {
			StreamInfos: Record<string, Record<string, unknown>>;
		};
		const info = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
			ObservedAdPodIds: new Set(["old-ad-1", "old-ad-2"]),
			ExpectedAdPodLength: 2,
			VisibleAdStartedAt: 1000,
		};
		state.StreamInfos["live:testchannel"] = info;
		merge({
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			adIds: ["old-ad-1", "old-ad-2"],
			expectedPodLength: 2,
			cycleStartedAt: 1000,
		});

		expect(clear("live:testchannel")).toBe(true);
		expect([...info.ObservedAdPodIds]).toEqual([]);
		expect(info.ExpectedAdPodLength).toBe(0);
		expect(info.VisibleAdStartedAt).toBe(0);

		const next = merge({
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			adIds: ["new-ad-1"],
			expectedPodLength: 3,
			cycleStartedAt: 2000,
		});
		apply(info, next || {});
		expect([...info.ObservedAdPodIds]).toEqual(["new-ad-1"]);
		expect(info.ExpectedAdPodLength).toBe(3);
		expect(info.VisibleAdStartedAt).toBe(2000);
	});

	it("invalidates backup and native async owners when a pod advances or clears", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const apply = T<
			(
				info: Record<string, unknown>,
				value: Record<string, unknown>,
			) => Record<string, unknown> | null
		>("_applyAdPodProgressToInfo");
		const clear = T<(mediaKey: string) => boolean>("_clearAdPodProgress");
		const state = g.__TTVAB_STATE__ as {
			StreamInfos: Record<string, Record<string, unknown>>;
		};
		const firstController = new AbortController();
		const info = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
			ObservedAdPodIds: new Set(["old-ad"]),
			ExpectedAdPodLength: 1,
			VisibleAdStartedAt: 1000,
			BackupSearchEpoch: 4,
			_BackupSearchPromises: new Map([["old-search", Promise.resolve(null)]]),
			_BackupSearchPromise: Promise.resolve(null),
			_BackupSearchKey: "old-search",
			_BackupSearchStartedAt: 900,
			_BackupSearchStartToken: {},
			_LastBackupSearchCompletedAt: 950,
			_BackupProbation: { type: "site" },
			BackupPlaylistMetadata: new Map([["old", { codec: "hevc" }]]),
			NativeRecoveryProbeEpoch: 7,
			_NativeRecoveryProbeInFlight: true,
			_NativeRecoveryProbeToken: {},
			LastNativeRecoveryProbeAt: 975,
			LastNativeRecoveryReadyPlayerType: "site",
			NativeRecoveryCleanCount: 2,
			NativeRecoveryProbeStreamUrl: "https://edge.example/native-recovery.m3u8",
			NativeRecoveryProbeMediaKey: "live:testchannel",
			NativeRecoveryProbePlayerType: "site",
			NativeRecoveryProbeCycleStartedAt: 1000,
			NativeRecoveryProbeLastMediaSequence: 500,
			NativeRecoveryProbeLastAdvancedAt: 975,
			ConsecutiveFailedNativeProbes: 3,
			_FatalMediaRecoveryRequestId: "old-fatal",
			RequestedAds: new Set(["old-ad"]),
			_AdRequestController: firstController,
		};
		state.StreamInfos["live:testchannel"] = info;
		merge({
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 1000,
			adIds: ["old-ad"],
		});

		apply(info, {
			mediaKey: "live:testchannel",
			cycleStartedAt: 2000,
			adIds: ["new-ad"],
		});

		expect(info.VisibleAdStartedAt).toBe(2000);
		expect(info.BackupSearchEpoch).toBe(5);
		expect(info._BackupSearchPromises.size).toBe(0);
		expect(info._BackupSearchPromise).toBe(null);
		expect(info._BackupSearchKey).toBe(null);
		expect(info._BackupSearchStartedAt).toBe(0);
		expect(info._BackupSearchStartToken).toBe(null);
		expect(info._LastBackupSearchCompletedAt).toBe(0);
		expect(info._BackupProbation).toBe(null);
		expect(info.BackupPlaylistMetadata.size).toBe(0);
		expect(info.NativeRecoveryProbeEpoch).toBe(8);
		expect(info._NativeRecoveryProbeInFlight).toBe(false);
		expect(info._NativeRecoveryProbeToken).toBe(null);
		expect(info.NativeRecoveryCleanCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
		expect(info.NativeRecoveryProbeMediaKey).toBe(null);
		expect(info.NativeRecoveryProbePlayerType).toBe(null);
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(null);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBe(0);
		expect(info.ConsecutiveFailedNativeProbes).toBe(0);
		expect(firstController.signal.aborted).toBe(true);

		const secondController = new AbortController();
		info._BackupSearchStartToken = {};
		info._NativeRecoveryProbeInFlight = true;
		info._NativeRecoveryProbeToken = {};
		info._AdRequestController = secondController;
		expect(clear("live:testchannel")).toBe(true);
		expect(info.VisibleAdStartedAt).toBe(0);
		expect(info.BackupSearchEpoch).toBe(6);
		expect(info._BackupSearchStartToken).toBe(null);
		expect(info.NativeRecoveryProbeEpoch).toBe(9);
		expect(info._NativeRecoveryProbeInFlight).toBe(false);
		expect(info._NativeRecoveryProbeToken).toBe(null);
		expect(secondController.signal.aborted).toBe(true);
	});
});
