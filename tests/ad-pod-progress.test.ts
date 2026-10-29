import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadModule, T } from "./helpers/runtime";

const g = globalThis as Record<string, unknown>;

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

	it("tracks the current pod separately when a midroll follows a preroll in one break", () => {
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
			cycleStartedAt: 1000,
		};
		const pod = (key: string, length: number, adIds: string[]) => ({
			key,
			length,
			adIds,
			maxPosition: adIds.length - 1,
			zeroPosition: true,
		});
		merge({
			...context,
			adIds: ["pre-0"],
			expectedPodLength: 1,
			pod: pod("preroll|1", 1, ["pre-0"]),
		});
		merge({
			...context,
			adIds: ["pre-0", "mid-0"],
			expectedPodLength: 8,
			pod: pod("midroll|8", 8, ["mid-0"]),
		});
		const merged = merge({
			...context,
			adIds: ["pre-0", "mid-0", "mid-1"],
			expectedPodLength: 8,
			pod: pod("midroll|8", 8, ["mid-1"]),
		});
		expect(merged?.adIds).toEqual(["pre-0", "mid-0", "mid-1"]);
		expect(merged?.pod).toEqual({
			key: "midroll|8",
			length: 8,
			adIds: ["mid-0", "mid-1"],
			maxPosition: 0,
			zeroPosition: true,
		});

		const replacementWorkerInfo: Record<string, unknown> = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
			CurrentAdPod: null,
		};
		apply(replacementWorkerInfo, merged || {});
		const seededPod = replacementWorkerInfo.CurrentAdPod as {
			key: string;
			length: number;
			adIds: Set<string>;
			spoofedAdIds: Set<string>;
			completeSent: boolean;
		};
		expect(seededPod.key).toBe("midroll|8");
		expect([...seededPod.adIds]).toEqual(["mid-0", "mid-1"]);
		expect(seededPod.spoofedAdIds.size).toBe(0);
		expect(seededPod.completeSent).toBe(false);

		const next = merge({
			...context,
			adIds: ["pre-0", "mid-0", "mid-1", "second-0"],
			expectedPodLength: 2,
			pod: pod("midroll|2", 2, ["second-0"]),
		});
		expect((next?.pod as { adIds: string[] } | undefined)?.adIds).toEqual([
			"second-0",
		]);
	});

	it("rejects malformed pod snapshots in progress messages", () => {
		const isPodSnapshot = T<(value: unknown) => boolean>("_isAdPodSnapshot");
		expect(isPodSnapshot(undefined)).toBe(true);
		expect(isPodSnapshot(null)).toBe(true);
		expect(
			isPodSnapshot({
				key: "midroll|2",
				length: 2,
				adIds: ["a"],
				maxPosition: 0,
				zeroPosition: true,
			}),
		).toBe(true);
		expect(isPodSnapshot({ key: "midroll|2", length: 2, adIds: [1] })).toBe(
			false,
		);
		expect(isPodSnapshot("pod")).toBe(false);
		expect(
			isPodSnapshot({
				key: "x".repeat(65),
				length: 2,
				adIds: [],
				maxPosition: 0,
				zeroPosition: false,
			}),
		).toBe(false);
	});

	it("keeps at most 32 media while protecting the page and the latest one", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaKey = "live:pagechannel";
		const progress = (channel: string) => ({
			mediaType: "live",
			channelName: channel,
			mediaKey: `live:${channel}`,
			expectedPodLength: 1,
			cycleStartedAt: 1000,
			adIds: [`${channel}-ad`],
		});

		merge(progress("pagechannel"));
		for (let index = 0; index < 40; index++) merge(progress(`banner${index}`));

		const entries = state.AdPodProgressByMediaKey as Record<string, unknown>;
		expect(Object.keys(entries)).toHaveLength(32);
		expect(entries).toHaveProperty(["live:pagechannel"]);
		expect(entries).toHaveProperty(["live:banner39"]);
		expect(entries).not.toHaveProperty(["live:banner0"]);
		expect(entries).not.toHaveProperty(["live:banner8"]);
		expect(entries).toHaveProperty(["live:banner9"]);
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

	it("keeps the ads already reported for a cycle across workers and drops them for a newer cycle", () => {
		const merge = T<
			(value: Record<string, unknown>) => Record<string, unknown> | null
		>("_mergeAdPodProgress");
		const context = {
			mediaType: "live",
			channelName: "testchannel",
			mediaKey: "live:testchannel",
			expectedPodLength: 2,
		};

		expect(
			merge({ ...context, cycleStartedAt: 1000, adIds: ["ad-1"] }),
		).not.toHaveProperty("reportedAdIds");
		merge({
			...context,
			cycleStartedAt: 1000,
			adIds: ["ad-1"],
			reportedAdIds: ["ad-1"],
		});
		expect(
			merge({
				...context,
				cycleStartedAt: 1000,
				adIds: ["ad-2"],
				reportedAdIds: ["ad-2", 3],
			}),
		).toMatchObject({ reportedAdIds: ["ad-1", "ad-2"] });
		expect(
			merge({
				...context,
				cycleStartedAt: 1000,
				reportedAdIds: Array.from({ length: 60 }, (_, index) => `x-${index}`),
			})?.reportedAdIds,
		).toHaveLength(50);
		expect(
			merge({ ...context, cycleStartedAt: 2000, adIds: ["ad-3"] }),
		).not.toHaveProperty("reportedAdIds");
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
			NativeRecoveryAdPlaylistUrls: new Set([
				"https://edge.example/ad-session.m3u8?token=player",
			]),
			NativeRecoveryAdMediaKey: "live:testchannel",
			NativeRecoveryAdStartedAt: 1000,
			NativeRecoveryCandidateUrl: "https://edge.example/player-native.m3u8",
			NativeRecoveryCandidateMediaKey: "live:testchannel",
			NativeRecoveryCandidateCycleStartedAt: 1000,
			NativeRecoveryCandidateStage: "visible",
			NativeRecoveryCandidateStartedAt: 900,
			NativeRecoveryCandidateCleanCount: 4,
			NativeRecoveryCandidateLastMediaSequence: 500,
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
		expect(info.NativeRecoveryAdPlaylistUrls.size).toBe(0);
		expect(info.NativeRecoveryAdMediaKey).toBe(null);
		expect(info.NativeRecoveryAdStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryCandidateMediaKey).toBe(null);
		expect(info.NativeRecoveryCandidateCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateStage).toBe(null);
		expect(info.NativeRecoveryCandidateStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
		expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(null);
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
