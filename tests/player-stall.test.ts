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
	loadModule("../dist/src/modules/player.js");
});

beforeEach(() => {
	g._log = () => {};
	g.__TTVAB_STATE__ = {
		IsBufferFixEnabled: true,
		PinnedBackupPlayerType: "autoplay",
		BackupSearchForceRefreshAt: 0,
		LastPinnedBackupStallDetectedAt: 0,
		PlayerBufferingDangerZone: 1,
	};
	g._broadcastWorkers = () => {};
	resetPinnedState();
});

afterEach(() => {
	vi.restoreAllMocks();
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function resetPinnedState() {
	const state = g._PinnedBackupStallState as Record<string, unknown>;
	state.firstObservedAt = 0;
	state.lastCurrentTime = 0;
	state.lastBufferedEnd = 0;
	state.lastForceRefreshAt = 0;
	state.lastPinnedType = null;
	state.forceRefreshCount = 0;
	state.exhaustedLogged = false;
}

function makePlayer(currentTime: () => number, bufferedEnd: () => number) {
	const video = document.createElement("video");
	Object.defineProperty(video, "currentTime", {
		get: currentTime,
		configurable: true,
	});
	Object.defineProperty(video, "buffered", {
		get: () => ({
			length: 1,
			start: () => 0,
			end: () => bufferedEnd(),
		}),
		configurable: true,
	});
	Object.defineProperty(video, "readyState", {
		get: () => 4,
		configurable: true,
	});
	Object.defineProperty(video, "ended", {
		get: () => false,
		configurable: true,
	});
	return {
		getHTMLVideoElement: () => video,
	};
}

describe("_checkPinnedBackupStall", () => {
	it("does not force backup re-search while playback advances with safe buffer", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 20;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 13;
		bufferedEnd = 20;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toEqual([]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(0);
	});

	it("forces backup re-search when playback and buffer stop advancing", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 10.2;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 10;
		bufferedEnd = 10.2;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toHaveLength(1);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(104000);
	});

	it("forces backup re-search when playback advances at a drained buffer edge", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 10.04;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 13;
		bufferedEnd = 13.04;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({
			key: "UpdateBackupSearchForceRefresh",
			value: 104000,
		});
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(104000);
	});

	it("restores the re-search budget after playback recovers (per-episode cap, not per-session)", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const state = g._PinnedBackupStallState as Record<string, unknown>;
		state.lastPinnedType = "autoplay";
		state.forceRefreshCount = 3;
		state.exhaustedLogged = true;
		state.lastForceRefreshAt = 90000;

		let currentTime = 10;
		let bufferedEnd = 20;
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		expect(state.forceRefreshCount).toBe(3);

		currentTime = 13;
		bufferedEnd = 20;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(state.forceRefreshCount).toBe(0);
		expect(state.exhaustedLogged).toBe(false);
		expect(state.lastForceRefreshAt).toBe(0);
	});
});

describe("_suppressCompetingMediaDuringAd (idempotent logging)", () => {
	function makeCompetingVideo() {
		const video = document.createElement("video");
		Object.defineProperty(video, "paused", {
			get: () => false,
			configurable: true,
		});
		Object.defineProperty(video, "ended", {
			get: () => false,
			configurable: true,
		});
		video.muted = false;
		video.volume = 1;
		document.body.appendChild(video);
		return video;
	}

	afterEach(() => {
		document.body.innerHTML = "";
		const state = g._AdAudioSuppressionState as {
			suppressedMedia: Map<unknown, unknown>;
			activeMediaKey: unknown;
			lastSuppressedCount: number;
		};
		state.suppressedMedia.clear();
		state.activeMediaKey = null;
		state.lastSuppressedCount = 0;
	});

	it("counts and logs each competing element only once across repeated calls", () => {
		const suppress = T<(channel?: string, mediaKey?: string) => number>(
			"_suppressCompetingMediaDuringAd",
		);
		g._getPrimaryMediaElement = () => null;
		g._resolvePlayerMediaKey = () => "live:test";
		const logs: string[] = [];
		g._log = (msg: string) => {
			logs.push(msg);
		};
		makeCompetingVideo();

		const first = suppress("test", "live:test");
		const second = suppress("test", "live:test");

		expect(first).toBe(1);
		expect(second).toBe(0);
		expect(
			logs.filter((m) => m.includes("competing media element")),
		).toHaveLength(1);
		const state = g._AdAudioSuppressionState as {
			suppressedMedia: Map<unknown, unknown>;
		};
		expect(state.suppressedMedia.size).toBe(1);
	});
});
