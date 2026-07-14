import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;
let originalGetPlayerAndState: unknown;

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
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/player.js");
	g._log = () => {};
	originalGetPlayerAndState = g._getPlayerAndState;
});

beforeEach(() => {
	const setIndependentVideoAdGuardEnabled =
		g._setIndependentVideoAdGuardEnabled;
	if (typeof setIndependentVideoAdGuardEnabled === "function") {
		setIndependentVideoAdGuardEnabled(false);
	}
	g.__TTVAB_STATE__ = {
		CurrentAdMediaKey: null,
		CurrentAdChannel: null,
		IsAdStrippingEnabled: true,
		PageMediaKey: "live:testchannel",
		PageChannel: "testchannel",
	};
	g._getPlayerAndState = originalGetPlayerAndState;
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

describe("_ensureIndependentVideoAdStyle", () => {
	const ensure = () => T<() => boolean>("_ensureIndependentVideoAdStyle");

	afterEach(() => {
		document.getElementById("ttvab-independent-video-ad-style")?.remove();
	});

	it("installs the document-level visual block for independent video ads", () => {
		expect(ensure()()).toBe(true);
		const style = document.getElementById("ttvab-independent-video-ad-style");
		expect(style?.textContent).toContain(
			'video[data-ttvab-independent-ad-suppressed="true"]',
		);
	});
});

describe("_suppressIndependentVideoAdsInDocument", () => {
	const suppress = () =>
		T<(root?: ParentNode) => number>("_suppressIndependentVideoAdsInDocument");

	function makeVideo(ariaLabel: string | null) {
		const video = document.createElement("video");
		if (ariaLabel) {
			video.setAttribute("aria-label", ariaLabel);
			video.src = "https://m.media-amazon.com/independent-ad.mp4";
		}
		video.muted = false;
		video.defaultMuted = false;
		video.volume = 1;
		const pause = vi.fn();
		Object.defineProperty(video, "pause", {
			value: pause,
			configurable: true,
		});
		document.body.appendChild(video);
		return { video, pause };
	}

	it("silences only independently injected videos Twitch labels as advertisements", () => {
		const primary = makeVideo(null);
		const ad = makeVideo("Video Advertisement");

		expect(suppress()()).toBe(1);
		expect(ad.video.muted).toBe(true);
		expect(ad.video.defaultMuted).toBe(true);
		expect(ad.video.volume).toBe(0);
		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.style.getPropertyValue("visibility")).toBe("hidden");
		expect(ad.video.hasAttribute("data-ttvab-independent-ad-suppressed")).toBe(
			true,
		);
		expect(ad.pause).not.toHaveBeenCalled();
		expect(primary.video.muted).toBe(false);
		expect(primary.video.volume).toBe(1);
		expect(primary.pause).not.toHaveBeenCalled();
	});

	it("restores the original element state when Twitch reuses the video", () => {
		const ad = makeVideo("Video Advertisement");
		ad.video.style.setProperty("display", "inline-block");
		ad.video.style.setProperty("visibility", "visible");
		ad.video.style.setProperty("pointer-events", "auto");
		ad.video.volume = 0.6;

		expect(suppress()()).toBe(1);
		ad.video.removeAttribute("aria-label");
		expect(
			T<(media: unknown) => boolean>("_suppressIndependentVideoAd")(ad.video),
		).toBe(false);
		expect(ad.video.style.getPropertyValue("display")).toBe("inline-block");
		expect(ad.video.style.getPropertyValue("visibility")).toBe("visible");
		expect(ad.video.style.getPropertyValue("pointer-events")).toBe("auto");
		expect(ad.video.muted).toBe(false);
		expect(ad.video.defaultMuted).toBe(false);
		expect(ad.video.volume).toBe(0.6);
		expect(ad.video.hasAttribute("data-ttvab-independent-ad-suppressed")).toBe(
			false,
		);
	});

	it("never suppresses the primary Twitch player", () => {
		const primary = makeVideo("Video Advertisement");
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => primary.video },
		});

		expect(suppress()()).toBe(0);
		expect(primary.video.style.getPropertyValue("display")).toBe("");
		expect(primary.video.muted).toBe(false);
		expect(primary.video.volume).toBe(1);
		expect(primary.pause).not.toHaveBeenCalled();
	});

	it("requires a known independent source while primary lookup is unresolved", () => {
		const knownAd = makeVideo("Video Advertisement");
		const unknownVideo = makeVideo(null);
		unknownVideo.video.setAttribute("aria-label", "Video Advertisement");
		unknownVideo.video.src = "blob:https://www.twitch.tv/primary-player";
		g._getPlayerAndState = () => ({ player: null });

		expect(suppress()()).toBe(1);
		expect(knownAd.video.muted).toBe(true);
		expect(unknownVideo.video.muted).toBe(false);
		expect(unknownVideo.video.style.getPropertyValue("display")).toBe("");
	});

	it("re-silences a confirmed independent ad after a late unmute", () => {
		const ad = makeVideo("Video Advertisement");
		const handleMediaEvent = T<(event: { target: EventTarget | null }) => void>(
			"_handleIndependentVideoAdMediaEvent",
		);

		expect(suppress()()).toBe(1);
		ad.video.defaultMuted = false;
		ad.video.muted = false;
		ad.video.volume = 1;
		handleMediaEvent({ target: ad.video });
		expect(ad.video.defaultMuted).toBe(true);
		expect(ad.video.muted).toBe(true);
		expect(ad.video.volume).toBe(0);
	});

	it("restores suppressed ads when ad blocking is disabled", () => {
		const ad = makeVideo("Video Advertisement");
		const setEnabled = T<(enabled: boolean) => boolean>(
			"_setIndependentVideoAdGuardEnabled",
		);

		expect(setEnabled(true)).toBe(true);
		expect(ad.video.muted).toBe(true);
		(
			g.__TTVAB_STATE__ as { IsAdStrippingEnabled: boolean }
		).IsAdStrippingEnabled = false;
		expect(setEnabled(false)).toBe(true);
		expect(
			document.getElementById("ttvab-independent-video-ad-style"),
		).toBeNull();
		expect(ad.video.style.getPropertyValue("display")).toBe("");
		expect(ad.video.muted).toBe(false);
		expect(ad.video.defaultMuted).toBe(false);
		expect(ad.video.volume).toBe(1);
	});
});

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

	let realGetPrimary: unknown;

	beforeEach(() => {
		realGetPrimary = g._getPrimaryMediaElement;
	});

	afterEach(() => {
		g._getPrimaryMediaElement = realGetPrimary;
	});

	it("restores even when the ending key differs but that ad cycle is over", () => {
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:otherchannel";
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey = null;
		g._getPrimaryMediaElement = () => media;

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

	it("restores only the current primary element for a matching cycle", () => {
		const primary = addSuppressed(true);
		const staleSecondary = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";
		g._getPrimaryMediaElement = () => primary;

		const restored = restore()("testchannel", "live:testchannel");

		expect(restored).toBe(1);
		expect(primary.muted).toBe(false);
		expect(staleSecondary.muted).toBe(true);
		expect(staleSecondary.volume).toBe(0);
		expect(staleSecondary.hasAttribute("data-ttvab-audio-suppressed")).toBe(
			false,
		);
		expect(suppressionState().suppressedMedia.size).toBe(0);
	});
});

describe("_suppressCompetingMediaDuringAd (periodic resweep)", () => {
	const sweep = () =>
		T<(channel?: string | null, mediaKey?: string | null) => number>(
			"_suppressCompetingMediaDuringAd",
		);

	let realGetPrimary: unknown;
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
		realGetPrimary = g._getPrimaryMediaElement;
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

describe("_setPagePlaybackContext (navigation suppression cleanup)", () => {
	const setContext = () =>
		T<
			(
				context: Record<string, unknown>,
				options?: { broadcast?: boolean },
			) => Record<string, unknown>
		>("_setPagePlaybackContext");

	function navState(mediaKey: string | null) {
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: mediaKey,
			CurrentAdMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			PinnedBackupPlayerType: "embed",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
		};
		(g._S as Record<string, unknown>).workers = [];
	}

	it("restores connected suppressed media when the media key changes", () => {
		navState("live:testchannel");
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";

		setContext()(
			{ MediaType: "live", ChannelName: "otherchannel" },
			{ broadcast: false },
		);

		expect(media.muted).toBe(false);
		expect(media.volume).toBe(1);
		expect(media.hasAttribute("data-ttvab-audio-suppressed")).toBe(false);
		expect(suppressionState().suppressedMedia.size).toBe(0);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey,
		).toBe(null);
	});

	it("keeps suppression intact when the context is unchanged", () => {
		navState("live:testchannel");
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";

		setContext()(
			{ MediaType: "live", ChannelName: "testchannel" },
			{ broadcast: false },
		);

		expect(media.muted).toBe(true);
		expect(suppressionState().suppressedMedia.size).toBe(1);
	});

	it("drops detached suppressed elements from tracking on navigation", () => {
		navState("live:testchannel");
		addSuppressed(false);
		suppressionState().activeMediaKey = "live:testchannel";

		setContext()(
			{ MediaType: "live", ChannelName: "otherchannel" },
			{ broadcast: false },
		);

		expect(suppressionState().suppressedMedia.size).toBe(0);
	});
});

describe("_guardPlaybackAcrossVisibilityTransition (watch-context gate)", () => {
	let resumeCalls: unknown[][];
	let scheduleCalls: unknown[][];
	let originalResume: unknown;
	let originalSchedule: unknown;

	beforeEach(() => {
		resumeCalls = [];
		scheduleCalls = [];
		originalResume = g._resumePrimaryPlaybackIfPaused;
		originalSchedule = g._schedulePlaybackRecoveryTimeout;
		g._resumePrimaryPlaybackIfPaused = (...args: unknown[]) => {
			resumeCalls.push(args);
			return true;
		};
		g._schedulePlaybackRecoveryTimeout = (...args: unknown[]) => {
			scheduleCalls.push(args);
			return 0;
		};
	});

	afterEach(() => {
		g._resumePrimaryPlaybackIfPaused = originalResume;
		g._schedulePlaybackRecoveryTimeout = originalSchedule;
	});

	function guard() {
		return T<(channel: unknown, mediaKey: unknown) => void>(
			"_guardPlaybackAcrossVisibilityTransition",
		);
	}

	it("stays inert without a watch context so front-page pauses set by the user or other extensions hold", () => {
		g.__TTVAB_STATE__ = {
			CurrentAdMediaKey: null,
			CurrentAdChannel: null,
			PageMediaKey: null,
			PageChannel: null,
		};

		guard()(null, null);

		expect(resumeCalls).toHaveLength(0);
		expect(scheduleCalls).toHaveLength(0);
	});

	it("still resumes paused playback on an active watch context", () => {
		guard()("testchannel", "live:testchannel");

		expect(resumeCalls).toHaveLength(1);
		expect(resumeCalls[0]).toEqual(["testchannel", "live:testchannel"]);
		expect(scheduleCalls.length).toBeGreaterThan(0);
	});
});
