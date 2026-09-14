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
		"init",
	])
		loadModule(name);
});

describe("refresh recovery for a player created before interception", () => {
	let video: HTMLVideoElement;
	let worker: Record<string, unknown>;
	let refresh: ReturnType<typeof vi.spyOn>;
	const check = () => T<() => void>("_checkUnhookedPlayer")();
	const notice = () => document.getElementById("ttvab-worker-recovery");
	const state = () => g.__TTVAB_STATE__ as Record<string, unknown>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		history.replaceState(null, "", "/testchannel");
		g.__TTVAB_STATE__ = {
			IsAdStrippingEnabled: true,
			PageMediaKey: "live:testchannel",
			PagePlaybackContextGeneration: 2,
		};
		Object.assign(g._UnhookedPlayerState as Record<string, unknown>, {
			workerRef: null,
			mediaKey: null,
			pageGeneration: 0,
			firstSeenAt: 0,
			noticeShownAt: 0,
		});
		video = document.createElement("video");
		document.body.append(video);
		Object.defineProperty(video, "readyState", {
			configurable: true,
			value: 4,
		});
		worker = { postMessage: vi.fn() };
		vi.spyOn(g, "_getPlayerAndState").mockImplementation(() => ({
			player: { core: { worker }, getHTMLVideoElement: () => video },
		}));
		vi.spyOn(g, "_getPrimaryMediaElement").mockImplementation(() => video);
		vi.spyOn(g, "_checkpointPageDiagnostics").mockReturnValue(true);
		refresh = vi.spyOn(window.location, "reload").mockImplementation(() => {});
	});

	afterEach(() => {
		T<() => void>("_clearWorkerRecoveryNotice")();
		video.remove();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function show() {
		check();
		expect(notice()).toBeNull();
		vi.advanceTimersByTime(5000);
		check();
	}

	it("requires stable evidence from the actual unhooked player and an explicit refresh click", () => {
		g._S = { workers: [{ __TTVABGeneration: 9 }] };
		show();
		expect(notice()?.textContent).toContain("start ad blocking");
		vi.advanceTimersByTime(30000);
		check();
		expect(notice()).not.toBeNull();
		expect(refresh).not.toHaveBeenCalled();
		notice()?.querySelector("button")?.click();
		expect(refresh).toHaveBeenCalledOnce();
		expect(worker.postMessage).not.toHaveBeenCalled();
	});

	it.each(["navigate", "generation", "replacement", "disable", "detach"])(
		"rejects a stale refresh after %s even before the next watchdog tick",
		(change) => {
			show();
			if (change === "navigate")
				history.replaceState(null, "", "/otherchannel");
			if (change === "generation") state().PagePlaybackContextGeneration = 3;
			if (change === "replacement")
				worker = { postMessage: vi.fn(), __TTVABGeneration: 3 };
			if (change === "disable") state().IsAdStrippingEnabled = false;
			if (change === "detach") video.remove();
			notice()?.querySelector("button")?.click();
			expect(refresh).not.toHaveBeenCalled();
			expect(notice()).toBeNull();
		},
	);

	it.each(["hooked", "crashed", "disabled", "pip", "auxiliary", "loading"])(
		"does not label %s playback as a late installation",
		(condition) => {
			if (condition === "hooked") worker.__TTVABGeneration = 2;
			if (condition === "crashed") worker.__TTVABCrashed = true;
			if (condition === "disabled") state().IsAdStrippingEnabled = false;
			if (condition === "pip")
				vi.spyOn(g, "_getPictureInPictureVideo").mockReturnValue(video);
			if (condition === "auxiliary")
				vi.spyOn(g, "_getPrimaryMediaElement").mockReturnValue(
					document.createElement("video"),
				);
			if (condition === "loading")
				Object.defineProperty(video, "readyState", { value: 0 });
			show();
			expect(notice()).toBeNull();
			expect(refresh).not.toHaveBeenCalled();
		},
	);

	it("respects dismissal without repeating the prompt for the same player", () => {
		show();
		notice()?.querySelectorAll("button")[1]?.click();
		vi.advanceTimersByTime(60000);
		check();
		expect(notice()).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("rejects refresh safely when Twitch's player getter stops working", () => {
		show();
		vi.spyOn(g, "_getPlayerAndState").mockImplementation(() => {
			throw new Error("player unavailable");
		});
		expect(() => notice()?.querySelector("button")?.click()).not.toThrow();
		expect(refresh).not.toHaveBeenCalled();
		expect(notice()).toBeNull();
	});

	it("removes the prompt after a hooked player replaces the old one", () => {
		show();
		worker = { postMessage: vi.fn(), __TTVABGeneration: 2 };
		check();
		expect(notice()).toBeNull();
	});
});

describe("manual refresh after bounded post-ad recovery", () => {
	let video: HTMLVideoElement;
	let player: {
		core: Record<string, unknown>;
		getHTMLVideoElement: () => HTMLVideoElement;
	};
	let frames: number;
	let refresh: ReturnType<typeof vi.spyOn>;
	const notice = () => document.getElementById("ttvab-worker-recovery");
	const state = () => g.__TTVAB_STATE__ as Record<string, unknown>;
	const expire = () =>
		T<() => boolean>("_maintainPostAdRecoveryTransactionLifetime")();
	const check = () => T<() => void>("_checkPostAdRecoveryNotice")();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		history.replaceState(null, "", "/testchannel");
		g.__TTVAB_STATE__ = {
			IsAdStrippingEnabled: true,
			PageMediaKey: "live:testchannel",
			PagePlaybackContextGeneration: 2,
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 50000,
		};
		g._S = { workers: [] };
		frames = 500;
		video = document.createElement("video");
		document.body.append(video);
		Object.defineProperties(video, {
			paused: { configurable: true, value: false },
			readyState: { configurable: true, value: 4 },
			videoWidth: { configurable: true, value: 2560 },
			buffered: { value: { length: 1, start: () => 0, end: () => 40 } },
			getVideoPlaybackQuality: { value: () => ({ totalVideoFrames: frames }) },
		});
		video.currentTime = 10;
		player = {
			core: { state: { bufferDuration: 30 } },
			getHTMLVideoElement: () => video,
		};
		vi.spyOn(g, "_getPlayerAndState").mockImplementation(() => ({ player }));
		vi.spyOn(g, "_getPrimaryMediaElement").mockImplementation(() => video);
		vi.spyOn(g, "_isNativeDocumentHidden").mockReturnValue(false);
		vi.spyOn(g, "_isActivePictureInPicturePlaybackContext").mockReturnValue(
			false,
		);
		vi.spyOn(g, "_hasUserPauseIntent").mockReturnValue(false);
		vi.spyOn(g, "_broadcastWorkers").mockReturnValue(undefined);
		vi.spyOn(g, "_checkpointPageDiagnostics").mockReturnValue(true);
		vi.spyOn(g, "_log").mockReturnValue(undefined);
		T<() => void>("_resetPostAdRecoveryTransaction")();
		Object.assign(g._PostAdRecoveryNoticeState as object, {
			mediaKey: null,
			cycleStartedAt: 0,
			playerRef: null,
			videoRef: null,
			noticeShownAt: 0,
		});
		Object.assign(g._PostAdRecoveryTransactionState as object, {
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 50000,
			expiresAt: 100000,
			reloadRequestCount: 2,
			acceptedReloadCount: 2,
			requiredNativeReloadAt: 90000,
			video,
			lastCurrentTime: 10,
			lastTotalFrames: 500,
		});
		refresh = vi.spyOn(window.location, "reload").mockImplementation(() => {});
	});

	afterEach(() => {
		T<() => void>("_clearWorkerRecoveryNotice")();
		T<() => void>("_resetPostAdRecoveryTransaction")();
		video.remove();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("retains exhausted counters and requires a click even when time advances without frames", () => {
		video.currentTime = 12;
		expect(expire()).toBe(false);
		expect(g._PostAdRecoveryTransactionState).toMatchObject({ mediaKey: null });
		expect(g._PostAdRecoveryDiagnostics).toMatchObject({
			phase: "exhausted",
			acceptedReloadCount: 2,
			totalVideoFrames: 500,
		});
		expect(notice()?.textContent).toContain(
			"Playback did not recover after ads",
		);
		expect(refresh).not.toHaveBeenCalled();
		notice()?.querySelector("button")?.click();
		expect(refresh).toHaveBeenCalledOnce();
		expect(g._broadcastWorkers).toHaveBeenCalledWith(
			expect.objectContaining({ key: "ReleasePostAdNativeSession" }),
		);
	});

	it.each([
		"navigate",
		"generation",
		"cycle",
		"new ad",
		"pause",
		"disable",
		"detach",
		"replacement",
		"getter failure",
	])("rejects a stale post-ad refresh after %s", (change) => {
		expire();
		expect(notice()).not.toBeNull();
		if (change === "navigate") history.replaceState(null, "", "/otherchannel");
		if (change === "generation") state().PagePlaybackContextGeneration = 3;
		if (change === "cycle") state().LastAdEndedCycleStartedAt = 60000;
		if (change === "new ad") state().CurrentAdMediaKey = "live:testchannel";
		if (change === "pause")
			vi.spyOn(g, "_hasUserPauseIntent").mockReturnValue(true);
		if (change === "disable") state().IsAdStrippingEnabled = false;
		if (change === "detach") video.remove();
		if (change === "replacement") player = { ...player };
		if (change === "getter failure")
			vi.spyOn(g, "_getPlayerAndState").mockImplementation(() => {
				throw new Error("unavailable");
			});
		expect(() => notice()?.querySelector("button")?.click()).not.toThrow();
		expect(refresh).not.toHaveBeenCalled();
		expect(notice()).toBeNull();
	});

	it("clears the notice only when current playback and frames advance", () => {
		expire();
		video.currentTime = 12;
		check();
		expect(notice()).not.toBeNull();
		frames += 60;
		check();
		expect(notice()).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it.each(["dismiss", "expire"])(
		"suppresses repeats after %s without replenishing automation",
		(action) => {
			expire();
			if (action === "dismiss")
				notice()?.querySelectorAll("button")[1]?.click();
			else vi.advanceTimersByTime(3000);
			T<(key: string, reason: string) => void>("_showWorkerRecoveryNotice")(
				"live:testchannel",
				"post-ad",
			);
			expect(notice()).toBeNull();
			expect(expire()).toBe(false);
			expect(refresh).not.toHaveBeenCalled();
		},
	);

	it("does not authorize a refresh from a historical diagnostic record", () => {
		Object.assign(g._PostAdRecoveryDiagnostics as object, {
			mediaKey: "live:testchannel",
			phase: "exhausted",
		});
		T<(key: string, reason: string) => void>("_showWorkerRecoveryNotice")(
			"live:testchannel",
			"post-ad",
		);
		expect(notice()).toBeNull();
	});

	it("exports the exhausted cycle and exact current worker without retaining live ownership in diagnostics", () => {
		const worker = { __TTVABGeneration: 7 };
		player.core.worker = worker;
		g._S = { workers: [{ __TTVABGeneration: 6 }, worker] };
		expire();
		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();
		expect(context.recovery).toMatchObject({
			phase: "exhausted",
			mediaKey: "live:testchannel",
			cycleStartedAt: 50000,
			acceptedReloadCount: 2,
		});
		expect(context.workers).toEqual([
			expect.objectContaining({ generation: 6, isCurrentPlayerWorker: false }),
			expect.objectContaining({ generation: 7, isCurrentPlayerWorker: true }),
		]);
		expect(JSON.stringify(context.recovery)).not.toContain("playerRef");
		state().PagePlaybackContextGeneration = 3;
		expect(T<() => unknown>("_collectPostAdRecoveryDiagnostics")()).toBeNull();
	});
});

describe("worker failure evidence survives retirement", () => {
	beforeEach(() => {
		(g._workerFailureDiagnostics as unknown[]).length = 0;
		g.__TTVAB_STATE__ = {
			PageMediaKey: "live:route",
			PagePlaybackContextGeneration: 4,
		};
		g._S = { workers: [] };
		vi.spyOn(g, "_checkpointPageDiagnostics").mockReturnValue(true);
	});
	afterEach(() => vi.restoreAllMocks());

	it("retains exact failed generation, actual banner ownership and the first failure time without a worker reference", () => {
		const worker = {
			__TTVABGeneration: 7,
			__TTVABLastPongAt: 1000,
			__TTVABPlaybackPageContext: { mediaKey: "vod:123" },
		};
		const record = T<
			(
				worker: unknown,
				context: unknown,
				message: string,
				error?: unknown,
			) => void
		>("_recordWorkerFailureDiagnostic");
		record(worker, { MediaKey: "live:route" }, "index out of bounds", {
			filename: "https://example.com/worker.js?token=secret",
			lineno: 8,
			colno: 2,
			error: { stack: "RuntimeError at wasm:123" },
		});
		const first = (g._workerFailureDiagnostics as Record<string, unknown>[])[0];
		record(worker, { MediaKey: "live:route" }, "Worker error");
		const snapshot = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();
		expect(snapshot.workers).toEqual([]);
		expect(snapshot.workerFailures).toEqual([
			expect.objectContaining({
				generation: 7,
				observedMediaKey: "vod:123",
				pageMediaKey: "live:route",
				pageGeneration: 4,
				failedAt: first.failedAt,
				line: 8,
				column: 2,
				stack: "RuntimeError at wasm:123",
			}),
		]);
		expect(JSON.stringify(snapshot.workerFailures)).not.toContain("secret");
		expect(g._checkpointPageDiagnostics).toHaveBeenCalledWith(true);
	});

	it("bounds retained failures after many retired workers", () => {
		const record = T<
			(worker: unknown, context: unknown, message: string) => void
		>("_recordWorkerFailureDiagnostic");
		for (let generation = 1; generation <= 30; generation++)
			record(
				{ __TTVABGeneration: generation },
				{ MediaKey: "live:route" },
				"error",
			);
		const failures = g._workerFailureDiagnostics as Record<string, unknown>[];
		expect(failures).toHaveLength(8);
		expect(failures[0].generation).toBe(23);
	});

	it("retains the failure when the crashed page's player state cannot be read", () => {
		vi.spyOn(g, "_getPlayerAndState").mockImplementation(() => {
			throw new Error("broken React state");
		});
		T<(worker: unknown, context: unknown, message: string) => void>(
			"_recordWorkerFailureDiagnostic",
		)(
			{ __TTVABGeneration: 9 },
			{ MediaKey: "live:route" },
			"original worker error",
		);
		expect(g._workerFailureDiagnostics).toEqual([
			expect.objectContaining({
				generation: 9,
				message: "original worker error",
				isCurrentPlayerWorker: null,
			}),
		]);
	});

	it("keeps a later failure in a different page generation separate", () => {
		const record = T<
			(worker: unknown, context: unknown, message: string) => void
		>("_recordWorkerFailureDiagnostic");
		const worker = { __TTVABGeneration: 7 };
		record(worker, { MediaKey: "live:route" }, "first error");
		(
			g.__TTVAB_STATE__ as Record<string, unknown>
		).PagePlaybackContextGeneration = 5;
		record(worker, { MediaKey: "live:other" }, "later error");
		const failures = g._workerFailureDiagnostics as Record<string, unknown>[];
		expect(failures).toHaveLength(2);
		expect(failures[0]).toMatchObject({
			pageGeneration: 4,
			mediaKey: "live:route",
			message: "first error",
		});
	});

	it("captures the worker-side stack without swallowing its error or sending unlimited reports", () => {
		let handleError: (event: unknown) => void = () => {};
		const postMessage = vi.fn();
		new Function(
			"self",
			"_formatLogText",
			`(${T<() => void>("_hookWorkerErrorDiagnostics").toString()})();`,
		)(
			{
				addEventListener: (_type: string, handler: typeof handleError) => {
					handleError = handler;
				},
				postMessage,
			},
			T<(text: string) => string>("_formatLogText"),
		);
		const event = {
			message: "index out of bounds",
			filename: "https://example.com/worker.js",
			lineno: 42,
			colno: 7,
			error: { stack: "run@wasm-function[102]:0xa5" },
			preventDefault: vi.fn(),
		};
		for (let index = 0; index < 20; index++) handleError(event);
		expect(postMessage).toHaveBeenCalledTimes(4);
		expect(postMessage.mock.calls[0][0].message).toMatchObject({
			key: "WorkerErrorDiagnostic",
			value: { stack: event.error.stack, lineno: 42, colno: 7 },
		});
		expect(event.preventDefault).not.toHaveBeenCalled();
	});
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
