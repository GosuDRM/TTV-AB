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

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/hooks.js");
});

beforeEach(() => {
	g._S = {
		workers: [],
		conflicts: [],
		reinsertPatterns: [],
		toleratedWorkerWrappers: [],
		adsBlocked: 0,
	};
	g.__TTVAB_STATE__ = {
		PageMediaType: "live",
		PageChannel: "testchannel",
		PageVodID: null,
		PageMediaKey: "live:testchannel",
	};
	g._log = () => {};
	const recoveryState = g._WorkerRecoveryState as Record<string, unknown>;
	recoveryState.contextKey = null;
	recoveryState.attempts = 0;
	recoveryState.lastAttemptAt = 0;
	recoveryState.limitLogged = false;
	g._lastWorkerRecoveryReloadAt = 0;
	window.history.replaceState(null, "", "/testchannel");
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete g._doPlayerTask;
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

describe("worker recovery lifecycle", () => {
	it("caps recovery attempts across replacement workers for the same playback context", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const context = { MediaType: "live", ChannelName: "testchannel" };

		expect(recordAttempt(context, 1000)).toBe(true);
		expect(recordAttempt(context, 2000)).toBe(true);
		expect(recordAttempt(context, 3000)).toBe(true);
		expect(recordAttempt(context, 4000)).toBe(false);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			3,
		);
	});

	it("resets the cap only after a replacement worker stays healthy", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const resetIfStable = T<
			(context: Record<string, unknown>, now?: number) => void
		>("_resetWorkerRecoveryStateIfStable");
		const context = { MediaType: "live", ChannelName: "testchannel" };

		expect(recordAttempt(context, 1000)).toBe(true);
		resetIfStable(context, 1000 + 59999);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			1,
		);

		resetIfStable(context, 1000 + 60000);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			0,
		);
	});

	it("tracks latest page context on worker objects so SPA navigation is not stale", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const getContext = T<
			(
				worker: Record<string, unknown>,
				fallback?: Record<string, unknown>,
			) => Record<string, unknown>
		>("_getWorkerPlaybackContext");
		const worker: Record<string, unknown> = {};

		rememberContext(worker, { MediaType: "live", ChannelName: "oldchannel" });
		rememberContext(worker, { MediaType: "live", ChannelName: "newchannel" });

		expect(worker.__TTVABPageChannel).toBe("newchannel");
		expect(worker.__TTVABPageMediaKey).toBe("live:newchannel");
		expect(getContext(worker).MediaKey).toBe("live:newchannel");
	});

	it("clears missed heartbeat count when a worker replies", () => {
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker: Record<string, unknown> = {
			__TTVABMissedPongs: 1,
		};

		markPong(worker, 1000);

		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABLastPongAt).toBe(1000);
	});

	it("installs fallback and schedules recovery for an instant crash", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		let installedFallback = 0;
		let reloads = 0;
		g._installPageSideM3U8Override = () => {
			installedFallback++;
		};
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = () => {
			reloads++;
			return true;
		};

		try {
			const worker: Record<string, unknown> = {};
			const didRecover = recover(
				worker,
				{ MediaType: "live", ChannelName: "testchannel" },
				"Worker crashed: boom",
				"error",
			);

			expect(didRecover).toBe(true);
			expect(worker.__TTVABCrashed).toBe(true);
			expect(installedFallback).toBe(1);
			expect(reloads).toBe(0);

			vi.advanceTimersByTime(1000);
			expect(reloads).toBe(1);
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("retries replacement worker recovery after reload cooldown instead of dropping it", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const attempt = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => void
		>("_attemptWorkerRestart");
		const reloads: unknown[][] = [];
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._lastWorkerRecoveryReloadAt = 100000;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = (...args: unknown[]) => {
			reloads.push(args);
			return true;
		};

		try {
			attempt({}, { MediaType: "live", ChannelName: "testchannel" });
			vi.advanceTimersByTime(1000);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(28999);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(1);
			expect(reloads).toHaveLength(1);
			expect(reloads[0][2]).toEqual({
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			});
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});
});

describe("page-side M3U8 fallback", () => {
	it("detects Twitch ad metadata beyond literal stitched-ad markers", () => {
		const hasMetadata = T<(text: string) => boolean>("_hasTwitchAdMetadata");

		expect(hasMetadata("#EXTM3U\n#EXT-X-CUE-OUT:30")).toBe(true);
		expect(hasMetadata('#EXTM3U\n#EXT-X-DATERANGE:CLASS="twitch-ad"')).toBe(
			true,
		);
		expect(hasMetadata("#EXTM3U\n#EXTINF:2.000,\nclean.ts")).toBe(false);
	});

	it("strips degraded fallback ad blocks marked by cue-out tags", () => {
		const strip = T<(text: string) => string>("_stripM3U8Ads");
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:1",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-1.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"ad-2.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"clean.ts",
		].join("\n");

		const stripped = strip(playlist);

		expect(stripped).not.toContain("#EXT-X-CUE-OUT");
		expect(stripped).not.toContain("ad-1.ts");
		expect(stripped).not.toContain("ad-2.ts");
		expect(stripped).toContain("clean.ts");
	});
});
