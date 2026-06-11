import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
	loadModule("../dist/src/modules/player.js");
	g._log = () => {};
});

beforeEach(() => {
	g.__TTVAB_STATE__ = {
		CurrentAdMediaKey: null,
		CurrentAdChannel: null,
		PageMediaKey: "live:testchannel",
		PageChannel: "testchannel",
	};
	const state = g._AdAudioSuppressionState as {
		suppressedMedia: Map<HTMLMediaElement, unknown>;
		activeMediaKey: string | null;
		lastSuppressedCount: number;
	};
	state.suppressedMedia.clear();
	state.activeMediaKey = null;
	state.lastSuppressedCount = 0;
	for (const el of [...document.querySelectorAll("video, audio")]) {
		el.remove();
	}
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function suppressionState() {
	return g._AdAudioSuppressionState as {
		suppressedMedia: Map<HTMLMediaElement, unknown>;
		activeMediaKey: string | null;
		lastSuppressedCount: number;
	};
}

function addSuppressed(connected: boolean) {
	const media = document.createElement("video");
	if (connected) {
		document.body.appendChild(media);
	}
	media.muted = true;
	media.defaultMuted = true;
	media.volume = 0;
	media.setAttribute("data-ttvab-audio-suppressed", "true");
	suppressionState().suppressedMedia.set(media, {
		muted: false,
		defaultMuted: false,
		volume: 1,
	});
	return media;
}

describe("_pruneDisconnectedSuppressedMedia", () => {
	const prune = () => T<() => number>("_pruneDisconnectedSuppressedMedia");

	it("unmutes a detached element before dropping it from tracking", () => {
		const detached = addSuppressed(false);
		suppressionState().activeMediaKey = "live:testchannel";

		const pruned = prune()();

		expect(pruned).toBe(1);
		expect(detached.muted).toBe(false);
		expect(detached.defaultMuted).toBe(false);
		expect(detached.volume).toBe(1);
		expect(detached.hasAttribute("data-ttvab-audio-suppressed")).toBe(false);
		expect(suppressionState().suppressedMedia.size).toBe(0);
	});

	it("leaves connected suppressed elements muted and tracked", () => {
		const connected = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";

		const pruned = prune()();

		expect(pruned).toBe(0);
		expect(connected.muted).toBe(true);
		expect(suppressionState().suppressedMedia.size).toBe(1);
	});
});

describe("_restoreSuppressedMediaAfterAd", () => {
	const restore = () =>
		T<(channel?: string | null, mediaKey?: string | null) => number>(
			"_restoreSuppressedMediaAfterAd",
		);

	it("restores even when the ending key differs but that ad cycle is over", () => {
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:otherchannel";
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey = null;

		const restored = restore()("testchannel", "live:testchannel");

		expect(restored).toBe(1);
		expect(media.muted).toBe(false);
		expect(suppressionState().suppressedMedia.size).toBe(0);
	});

	it("does not restore while the suppressing ad cycle is still active", () => {
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:otherchannel";
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
			"live:otherchannel";

		const restored = restore()("testchannel", "live:testchannel");

		expect(restored).toBe(0);
		expect(media.muted).toBe(true);
		expect(suppressionState().suppressedMedia.size).toBe(1);
	});

	it("restores all suppressed elements for a matching cycle", () => {
		const a = addSuppressed(true);
		const b = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";

		const restored = restore()("testchannel", "live:testchannel");

		expect(restored).toBe(2);
		expect(a.muted).toBe(false);
		expect(b.muted).toBe(false);
		expect(suppressionState().suppressedMedia.size).toBe(0);
	});
});

describe("_suppressCompetingMediaDuringAd (periodic resweep)", () => {
	const sweep = () =>
		T<(channel?: string | null, mediaKey?: string | null) => number>(
			"_suppressCompetingMediaDuringAd",
		);

	const realGetPrimary = g._getPrimaryMediaElement;
	let primary: HTMLVideoElement;

	function makeMedia(playing: boolean) {
		const el = document.createElement("video");
		let isPlaying = playing;
		Object.defineProperty(el, "paused", {
			get: () => !isPlaying,
			configurable: true,
		});
		Object.defineProperty(el, "ended", {
			get: () => false,
			configurable: true,
		});
		document.body.appendChild(el);
		return {
			el: el as HTMLVideoElement,
			setPlaying: (v: boolean) => {
				isPlaying = v;
			},
		};
	}

	beforeEach(() => {
		primary = makeMedia(true).el;
		g._getPrimaryMediaElement = () => primary;
	});

	afterEach(() => {
		g._getPrimaryMediaElement = realGetPrimary;
	});

	it("catches a competing element that attaches after the first sweep", () => {
		expect(sweep()("testchannel", "live:testchannel")).toBe(0);

		const late = makeMedia(true);
		expect(sweep()("testchannel", "live:testchannel")).toBe(1);
		expect(late.el.muted).toBe(true);
		expect(late.el.volume).toBe(0);
		expect(late.el.hasAttribute("data-ttvab-audio-suppressed")).toBe(true);
		expect(primary.muted).toBe(false);
	});

	it("catches a parked element once it starts playing", () => {
		const parked = makeMedia(false);
		parked.el.muted = true;
		parked.el.volume = 0;
		expect(sweep()("testchannel", "live:testchannel")).toBe(0);

		parked.el.muted = false;
		parked.el.volume = 0.8;
		parked.setPlaying(true);
		expect(sweep()("testchannel", "live:testchannel")).toBe(1);
		expect(parked.el.muted).toBe(true);
	});

	it("does not double-count an element that stays suppressed across sweeps", () => {
		const competing = makeMedia(true);
		expect(sweep()("testchannel", "live:testchannel")).toBe(1);
		expect(sweep()("testchannel", "live:testchannel")).toBe(0);
		expect(competing.el.muted).toBe(true);
		expect(suppressionState().suppressedMedia.size).toBe(1);
	});
});
