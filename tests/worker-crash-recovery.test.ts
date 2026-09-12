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

function loadModule(name: string) {
	const js = readFileSync(
		resolve(__dirname, `../dist/src/modules/${name}.js`),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

function T<T>(name: string): T {
	return g[name] as T;
}

beforeAll(() => {
	for (const name of [
		"constants",
		"logger",
		"parser",
		"state",
		"api",
		"processor",
		"hooks",
		"worker",
		"player",
		"ui",
	])
		loadModule(name);
});

describe("crashed worker recovery with the real player task", () => {
	const context = {
		MediaType: "live",
		ChannelName: "testchannel",
		MediaKey: "live:testchannel",
	};
	let worker: Record<string, unknown>;
	let setSrc: ReturnType<typeof vi.fn>;
	let player: {
		core: { worker: Record<string, unknown> };
		getHTMLVideoElement: () => null;
	};
	let refresh: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		window.history.replaceState(null, "", "/testchannel");
		vi.spyOn(document, "hidden", "get").mockReturnValue(false);
		vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: context.MediaKey,
			StreamInfos: {},
			StreamInfosByUrl: {},
			AdPodProgressByMediaKey: {},
			LastPlayerReloadAt: 0,
			LastPlayerReloadAtByMediaKey: {},
		};
		worker = {
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: context.MediaKey,
			__TTVABCreatedAt: 90000,
			__TTVABPlaybackObservedAtByMediaKey: new Map([[context.MediaKey, 99000]]),
		};
		g._S = {
			workers: [worker],
			workerRefs: [],
			conflicts: [],
			reinsertPatterns: [],
			toleratedWorkerWrappers: [],
		};
		T<Map<string, unknown>>("_WorkerRecoveryStates").clear();
		T<Map<string, unknown>>("_WorkerPlaybackOwnerGenerationByContext").clear();
		T<Map<string, unknown>>("_pageAdCycleControlByMediaKey").clear();
		T<() => void>("_clearRecordedUserPauseIntent")();
		T<() => void>("_clearActivePictureInPicturePlaybackContext")();
		T<() => void>("_resetPostAdRecoveryTransaction")();
		setSrc = vi.fn(async () => "success");
		player = { core: { worker }, getHTMLVideoElement: () => null };
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue({
			player,
			state: { props: { mediaPlayerInstance: player }, setSrc },
		});
		vi.spyOn(g, "_shouldSuppressAutomaticPlaybackResume").mockReturnValue(
			false,
		);
		vi.spyOn(g, "_installPageSideM3U8Override").mockReturnValue(undefined);
		vi.spyOn(g, "_log").mockReturnValue(undefined);
		refresh = vi.spyOn(window.location, "reload").mockImplementation(() => {});
	});

	afterEach(() => {
		T<() => void>("_clearWorkerRecoveryNotice")();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function crash() {
		T<(worker: unknown, context: unknown, message: string) => void>(
			"_recoverCrashedWorker",
		)(worker, context, "Worker crashed: index out of bounds");
	}

	function exhaust() {
		crash();
		vi.advanceTimersByTime(7000);
	}

	it("does not treat setSrc success on the cached dead worker as a restart", () => {
		exhaust();
		expect(setSrc).not.toHaveBeenCalled();
		expect(
			T<(key: string) => number>("_getPlayerReloadAtForMediaKey")(
				context.MediaKey,
			),
		).toBe(0);
		const state = T<(context: unknown) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)(context);
		expect(state.phase).toBe("exhausted");
		expect(state.attempts).toBe(3);
		expect(document.querySelectorAll("#ttvab-worker-recovery")).toHaveLength(1);
		expect(refresh).not.toHaveBeenCalled();
		vi.advanceTimersByTime(120000);
		expect(setSrc).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});

	it.each(["buffer-recovery", "ad-recovery", "manual"])(
		"rejects %s source loads after worker recovery exhausts",
		(reason) => {
			exhaust();
			for (let attempt = 0; attempt < 12; attempt++) {
				expect(
					T<(pause: boolean, reload: boolean, options: unknown) => boolean>(
						"_doPlayerTask",
					)(false, true, { reason }),
				).toBe(false);
				vi.advanceTimersByTime(15000);
			}
			expect(setSrc).not.toHaveBeenCalled();
			expect(refresh).not.toHaveBeenCalled();
			expect(
				T<(key: string) => number>("_getPlayerReloadAtForMediaKey")(
					context.MediaKey,
				),
			).toBe(0);
		},
	);

	it("rejects buffer recovery during the terminated-worker replacement grace period", () => {
		worker.__TTVABIntentionallyTerminated = true;
		expect(
			T<(pause: boolean, reload: boolean, options: unknown) => boolean>(
				"_doPlayerTask",
			)(false, true, { reason: "buffer-recovery" }),
		).toBe(false);
		expect(setSrc).not.toHaveBeenCalled();
	});

	it("does not pause and resume a dead core as an alternative recovery", () => {
		worker.__TTVABCrashed = true;
		const pause = vi.spyOn(g, "_pausePlaybackTarget").mockReturnValue(true);
		const play = vi.spyOn(g, "_playPlaybackTarget").mockReturnValue(true);
		expect(
			T<(pause: boolean, reload: boolean, options: unknown) => boolean>(
				"_doPlayerTask",
			)(true, false, { reason: "buffer-recovery" }),
		).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(pause).not.toHaveBeenCalled();
		expect(play).not.toHaveBeenCalled();
	});

	it("allows buffer repair on a replacement core even after the old worker exhausted recovery", () => {
		exhaust();
		player.core.worker = { __TTVABGeneration: 2 };
		expect(
			T<(pause: boolean, reload: boolean, options: unknown) => boolean>(
				"_doPlayerTask",
			)(false, true, { reason: "buffer-recovery" }),
		).toBe(true);
		expect(setSrc).toHaveBeenCalledOnce();
	});

	it("refreshes only after an explicit click for the still-exhausted current page", () => {
		exhaust();
		document
			.querySelector<HTMLButtonElement>("#ttvab-worker-recovery button")
			?.click();
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("does not refresh a different channel from a stale notice", () => {
		exhaust();
		window.history.replaceState(null, "", "/otherchannel");
		document
			.querySelector<HTMLButtonElement>("#ttvab-worker-recovery button")
			?.click();
		expect(refresh).not.toHaveBeenCalled();
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
	});

	it("removes the notice when a healthy replacement proves playback ownership", () => {
		exhaust();
		const replacement = {
			__TTVABGeneration: 2,
			__TTVABPageMediaKey: context.MediaKey,
			__TTVABFirstPongAt: Date.now(),
			__TTVABLastPongAt: Date.now(),
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				[context.MediaKey, Date.now()],
			]),
		};
		expect(
			T<(worker: unknown, now: number, context: unknown) => boolean>(
				"_promoteWorkerPlaybackOwner",
			)(replacement, Date.now(), context),
		).toBe(true);
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("clears the notice when its playback context is released", () => {
		exhaust();
		T<(context: unknown) => void>("_releasePlaybackContext")(context);
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
	});

	it("does not consume recovery attempts or refresh while the viewer explicitly paused", () => {
		vi.spyOn(g, "_hasUserPauseIntent").mockReturnValue(true);
		crash();
		vi.advanceTimersByTime(30000);
		expect(
			T<(context: unknown) => Record<string, unknown>>(
				"_getWorkerRecoveryState",
			)(context).attempts,
		).toBe(0);
		expect(setSrc).not.toHaveBeenCalled();
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("expires the warning after 3 seconds without authorizing more recovery", () => {
		exhaust();
		const recovery = T<(context: unknown) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)(context);
		vi.advanceTimersByTime(2999);
		expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(recovery.phase).toBe("exhausted");
		expect(recovery.attempts).toBe(3);
		expect(setSrc).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
	});

	it("keeps dismissal through a failed successor in the same exhausted recovery", () => {
		exhaust();
		const recovery = T<(context: unknown) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)(context);
		const lastAttempt = recovery.lastAttemptAt;
		document
			.querySelectorAll<HTMLButtonElement>("#ttvab-worker-recovery button")[1]
			.click();
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
		const failedSuccessor = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: Date.now(),
			__TTVABPageMediaKey: context.MediaKey,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				[context.MediaKey, Date.now()],
			]),
		};
		player.core.worker = failedSuccessor;
		(g._S as { workers: unknown[] }).workers = [failedSuccessor];
		T<(worker: unknown, context: unknown, message: string) => void>(
			"_recoverCrashedWorker",
		)(failedSuccessor, context, "Successor failed before recovery stabilized");
		expect(recovery.attempts).toBe(3);
		expect(recovery.lastAttemptAt).toBe(lastAttempt);
		expect(setSrc).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
	});

	it("clears the warning on verified fallback recovery before its expiry callback runs", async () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const cycleStartedAt = 90000;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/issue76-native.m3u8";
		Object.assign(state, {
			IsAdStrippingEnabled: true,
			CurrentAdChannel: context.ChannelName,
			CurrentAdMediaKey: context.MediaKey,
			AdPodProgressByMediaKey: { [context.MediaKey]: { cycleStartedAt } },
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdSegmentCache: new Map(),
		});
		for (const key of [
			"_pageSidePlaybackOwnerByUrl",
			"_pageSideEmptyHoldInfoByUrl",
			"_pageSideVariantCodecByUrl",
		]) {
			T<Map<string, unknown>>(key).clear();
		}
		worker.__TTVABFirstPongAt = Date.now();
		worker.__TTVABLastPongAt = Date.now();
		expect(
			T<(worker: unknown, now: number, context: unknown) => boolean>(
				"_promoteWorkerPlaybackOwner",
			)(worker, Date.now(), context),
		).toBe(true);
		expect(
			T<(...args: unknown[]) => boolean>("_rememberPageSidePlaybackOwner")(
				context.MediaKey,
				mediaUrl,
				"hev1.1.6.L153.B0",
				cycleStartedAt,
				{
					confirmedPlayback: true,
					workerGeneration: 1,
					decoderCodec: "hev1.1.6.L153.B0",
					handoffId: null,
				},
			),
		).toBe(true);
		for (const key of [
			"_clearPlaybackRecoveryTimeoutsForContext",
			"_resetPlayerBufferMonitorState",
			"_clearAdResumeIntent",
			"_restoreSuppressedMediaAfterAd",
			"_schedulePostAdArtifactCleanup",
		]) {
			vi.spyOn(g, key).mockReturnValue(undefined);
		}
		vi.mocked(g._installPageSideM3U8Override as () => void).mockRestore();
		const savedFetch = window.fetch;
		const scopedWindow = window as unknown as Record<string, unknown>;
		const savedRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const savedActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		let mediaSequence = 600;
		const rawFetch = vi.fn(
			async () =>
				new Response(
					[
						"#EXTM3U",
						"#EXT-X-TARGETDURATION:2",
						`#EXT-X-MEDIA-SEQUENCE:${mediaSequence++}`,
						"#EXTINF:2.000,",
						"https://edge.example/native.ts",
					].join("\n"),
					{ status: 200 },
				),
		);
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		try {
			crash();
			vi.advanceTimersByTime(7000);
			expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
			for (let index = 0; index < 6; index++) {
				await expect(window.fetch(mediaUrl)).rejects.toMatchObject({
					name: "AbortError",
				});
				vi.setSystemTime(Date.now() + 2000);
			}
			expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
			const restored = await (await window.fetch(mediaUrl)).text();
			expect(restored).toContain("native.ts");
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(state.LastAdEndedCycleStartedAt).toBe(cycleStartedAt);
			const recovery = T<(context: unknown) => Record<string, unknown>>(
				"_getWorkerRecoveryState",
			)(context);
			expect(recovery.phase).toBe("exhausted");
			expect(recovery.attempts).toBe(3);
			expect(rawFetch).toHaveBeenCalledTimes(7);
			expect(setSrc).not.toHaveBeenCalled();
			expect(refresh).not.toHaveBeenCalled();
			expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
		} finally {
			window.fetch = savedFetch;
			scopedWindow.__TTVAB_REAL_FETCH__ = savedRealFetch;
			scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = savedActive;
		}
	});

	it("allows a later warning only after healthy playback rearms the recovery budget", () => {
		exhaust();
		document
			.querySelectorAll<HTMLButtonElement>("#ttvab-worker-recovery button")[1]
			.click();
		const recovery = T<(context: unknown) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)(context);
		const successor = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: Date.now(),
			__TTVABPageMediaKey: context.MediaKey,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				[context.MediaKey, Date.now()],
			]),
		};
		player.core.worker = successor;
		(g._S as { workers: unknown[] }).workers = [successor];
		const markPong =
			T<(worker: unknown, now: number) => void>("_markWorkerPong");
		markPong(successor, Date.now());
		expect(recovery.phase).toBe("stabilizing");
		vi.advanceTimersByTime(60000);
		successor.__TTVABPlaybackObservedAtByMediaKey.set(
			context.MediaKey,
			Date.now(),
		);
		markPong(successor, Date.now());
		expect(recovery.attempts).toBe(0);
		expect(recovery.phase).toBe("idle");
		T<(worker: unknown, context: unknown, message: string) => void>(
			"_recoverCrashedWorker",
		)(successor, context, "Later independent failure");
		vi.advanceTimersByTime(7000);
		expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
		expect(recovery.attempts).toBe(3);
	});

	it("does not let an earlier notice expiry clear the next notice", () => {
		exhaust();
		vi.advanceTimersByTime(1000);
		T<(context: unknown) => boolean>("_releasePlaybackContext")(context);
		const otherContext = {
			MediaType: "live",
			ChannelName: "otherchannel",
			MediaKey: "live:otherchannel",
		};
		window.history.replaceState(null, "", "/otherchannel");
		Object.assign(g.__TTVAB_STATE__ as Record<string, unknown>, {
			PageChannel: otherContext.ChannelName,
			PageMediaKey: otherContext.MediaKey,
			PagePlaybackContextGeneration: 1,
		});
		const otherWorker = {
			__TTVABGeneration: 2,
			__TTVABPageMediaKey: otherContext.MediaKey,
			__TTVABCreatedAt: Date.now(),
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				[otherContext.MediaKey, Date.now()],
			]),
		};
		player.core.worker = otherWorker;
		(g._S as { workers: unknown[] }).workers = [otherWorker];
		for (let attempt = 0; attempt < 3; attempt++) {
			T<(context: unknown) => boolean>("_recordWorkerRecoveryAttempt")(
				otherContext,
			);
		}
		T<(worker: unknown, context: unknown, message: string) => void>(
			"_recoverCrashedWorker",
		)(otherWorker, otherContext, "Another channel failed");
		expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
		vi.advanceTimersByTime(2000);
		expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
		vi.advanceTimersByTime(999);
		expect(document.getElementById("ttvab-worker-recovery")).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(document.getElementById("ttvab-worker-recovery")).toBeNull();
	});
});
