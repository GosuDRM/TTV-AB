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
		const player = { core: { worker }, getHTMLVideoElement: () => null };
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
		vi.advanceTimersByTime(10000);
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
});
