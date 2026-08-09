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
	const clearPictureInPictureContext =
		g._clearActivePictureInPicturePlaybackContext;
	if (typeof clearPictureInPictureContext === "function") {
		clearPictureInPictureContext();
	}
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
	g._log = () => {};
	const independentState = g._IndependentVideoAdSuppressionState as {
		observer: MutationObserver | null;
		pruneTimeoutId: ReturnType<typeof setTimeout> | null;
		suppressedMedia: Map<HTMLVideoElement, unknown>;
		suppressedContainers: Map<HTMLElement, unknown>;
	};
	independentState.observer?.disconnect();
	independentState.observer = null;
	if (independentState.pruneTimeoutId) {
		clearTimeout(independentState.pruneTimeoutId);
	}
	independentState.pruneTimeoutId = null;
	independentState.suppressedMedia.clear();
	independentState.suppressedContainers.clear();
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
		expect(style?.textContent).toContain(
			'[data-ttvab-independent-ad-container="true"]{display:none!important}',
		);
	});

	it("collapses the known player-adjacent and chat ad slots without script", () => {
		expect(ensure()()).toBe(true);
		const style = document.getElementById("ttvab-independent-video-ad-style");
		expect(style?.textContent).toContain(
			'.stream-display-ad__wrapper + div > div[style^="position:"] > div[class^="Layout-sc-"]:has(video[src^="https://m.media-amazon.com"])',
		);
		expect(style?.textContent).toContain(
			'.chat-shell > div[class^="Layout-sc-"] > div[style^="transition:"]:has(video[src^="https://m.media-amazon.com"])',
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

	it("keeps a known ad suppressed until Twitch replaces its source", () => {
		const ad = makeVideo("Video Advertisement");
		ad.video.style.setProperty("display", "inline-block");
		ad.video.style.setProperty("visibility", "visible");
		ad.video.style.setProperty("pointer-events", "auto");
		ad.video.volume = 0.6;

		expect(suppress()()).toBe(1);
		ad.video.removeAttribute("aria-label");
		expect(
			T<(media: unknown) => boolean>("_suppressIndependentVideoAd")(ad.video),
		).toBe(true);
		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.muted).toBe(true);
		expect(ad.video.volume).toBe(0);

		ad.video.src = "blob:https://www.twitch.tv/reused-player";
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

	it("suppresses a known ad source without relying on an English label", () => {
		const ad = makeVideo(null);
		ad.video.setAttribute("aria-label", "Publicidad en video");
		ad.video.src = "https://m.media-amazon.com/localized-ad.mp4";

		expect(suppress()()).toBe(1);
		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.muted).toBe(true);
	});

	it("detects a known ad source supplied through a child source element", () => {
		const ad = makeVideo(null);
		const source = document.createElement("source");
		source.src = "https://m.media-amazon.com/source-ad.mp4";
		ad.video.appendChild(source);

		expect(suppress()()).toBe(1);
		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.muted).toBe(true);
	});

	it("keeps a known Amazon ad suppressed when player lookup later claims it", () => {
		const ad = makeVideo(null);
		ad.video.setAttribute(
			"aria-label",
			"This advertisement promotes a streaming service",
		);
		ad.video.src = "https://m.media-amazon.com/player-side-ad.mp4";
		g._getPlayerAndState = () => ({ player: null });

		expect(suppress()()).toBe(1);
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => ad.video },
		});
		ad.video.defaultMuted = false;
		ad.video.muted = false;
		ad.video.volume = 1;
		T<(event: { target: EventTarget | null }) => void>(
			"_handleIndependentVideoAdMediaEvent",
		)({ target: ad.video });

		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.muted).toBe(true);
		expect(ad.video.volume).toBe(0);
		expect(ad.video.hasAttribute("data-ttvab-independent-ad-suppressed")).toBe(
			true,
		);
	});

	it("never suppresses a label-only primary Twitch player", () => {
		const primary = makeVideo("Video Advertisement");
		primary.video.src = "blob:https://www.twitch.tv/primary-player";
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

	it("records the original ad element markup when suppression begins", () => {
		const log = vi.fn();
		g._log = log;
		makeVideo("Video Advertisement");

		expect(suppress()()).toBe(1);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining(
				'<video aria-label="Video Advertisement" src="https://m.media-amazon.com/independent-ad.mp4"',
			),
			"info",
		);
		expect(
			String(
				log.mock.calls.find(([message]) =>
					String(message).startsWith("Suppressed independent"),
				)?.[0],
			),
		).not.toContain("data-ttvab-independent-ad-suppressed");
	});

	it("captures current ad markup for an on-demand log export", () => {
		const log = vi.fn();
		g._log = log;
		const ad = makeVideo(null);
		ad.video.setAttribute("aria-label", "Publicidad en video");
		ad.video.src = "https://m.media-amazon.com/export-snapshot.mp4";

		expect(T<() => number>("_captureIndependentVideoAdDiagnostics")()).toBe(1);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining(
				'<video aria-label="Publicidad en video" src="https://m.media-amazon.com/export-snapshot.mp4"',
			),
			"info",
		);
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

	it("pauses a detached ad before restoring audio when blocking is disabled", () => {
		const ad = makeVideo("Video Advertisement");

		expect(suppress()()).toBe(1);
		ad.video.remove();
		(
			g.__TTVAB_STATE__ as { IsAdStrippingEnabled: boolean }
		).IsAdStrippingEnabled = false;
		T<(enabled: boolean) => boolean>("_setIndependentVideoAdGuardEnabled")(
			false,
		);

		expect(ad.pause).toHaveBeenCalled();
		expect(ad.video.muted).toBe(false);
	});

	it("hides a descriptive-label ad even when it is not Amazon-hosted", () => {
		const primary = makeVideo(null);
		primary.video.src = "blob:https://www.twitch.tv/primary-player";
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => primary.video },
		});
		const ad = makeVideo(null);
		ad.video.setAttribute(
			"aria-label",
			"This advertisement promotes a new streaming service",
		);
		ad.video.src = "https://cdn.example.com/rotated-ad.mp4";

		expect(suppress()()).toBe(1);
		expect(ad.video.style.getPropertyValue("display")).toBe("none");
		expect(ad.video.muted).toBe(true);
		expect(primary.video.muted).toBe(false);
	});

	it("never hides labeled blob-backed media so a misdirected player lookup cannot black out the stream", () => {
		const other = makeVideo(null);
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => other.video },
		});
		const labeledStream = makeVideo(null);
		labeledStream.video.setAttribute("aria-label", "Video Advertisement");
		labeledStream.video.src = "blob:https://www.twitch.tv/backup-stream";

		expect(suppress()()).toBe(0);
		expect(labeledStream.video.style.getPropertyValue("display")).toBe("");
		expect(labeledStream.video.muted).toBe(false);
	});

	it("counts each independent ad exactly once toward blocked stats", () => {
		const originalIncrement = g._incrementAdsBlocked;
		const increment = vi.fn();
		g._incrementAdsBlocked = increment;
		try {
			const ad = makeVideo("Video Advertisement");

			expect(suppress()()).toBe(1);
			expect(increment).toHaveBeenCalledTimes(1);
			expect(increment).toHaveBeenCalledWith("testchannel");

			ad.video.muted = false;
			T<(event: { target: EventTarget | null }) => void>(
				"_handleIndependentVideoAdMediaEvent",
			)({ target: ad.video });
			expect(increment).toHaveBeenCalledTimes(1);

			ad.video.src = "blob:https://www.twitch.tv/reused-player";
			ad.video.removeAttribute("aria-label");
			expect(
				T<(media: unknown) => boolean>("_suppressIndependentVideoAd")(ad.video),
			).toBe(false);
			ad.video.src = "https://m.media-amazon.com/next-creative.mp4";
			expect(suppress()()).toBe(1);
			expect(increment).toHaveBeenCalledTimes(2);
		} finally {
			g._incrementAdsBlocked = originalIncrement;
		}
	});
});

describe("independent video ad container collapse", () => {
	const suppress = () =>
		T<(root?: ParentNode) => number>("_suppressIndependentVideoAdsInDocument");
	const setGuardEnabled = () =>
		T<(enabled: boolean) => boolean>("_setIndependentVideoAdGuardEnabled");
	const roots: HTMLElement[] = [];

	function mount(markup: string) {
		const root = document.createElement("div");
		root.innerHTML = markup;
		document.body.appendChild(root);
		roots.push(root);
		return root;
	}

	afterEach(() => {
		while (roots.length) roots.pop()?.remove();
	});

	it("collapses the ad slot beside the player instead of only the video", () => {
		const root = mount(`
			<main>
				<div class="stream-display-ad__wrapper"></div>
				<div id="slot">
					<div style="position: absolute;">
						<div class="Layout-sc-1xcs6mc-0">
							<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
						</div>
					</div>
				</div>
			</main>
		`);
		const slot = root.querySelector("#slot") as HTMLElement;
		const wrapper = root.querySelector(
			".stream-display-ad__wrapper",
		) as HTMLElement;

		expect(suppress()()).toBe(1);

		expect(slot.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);
		expect(slot.style.getPropertyValue("display")).toBe("none");
		expect(wrapper.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(
			root
				.querySelector("main")
				?.hasAttribute("data-ttvab-independent-ad-container"),
		).toBe(false);
	});

	it("stops at the chat shell so chat stays visible", () => {
		const root = mount(`
			<div class="chat-shell">
				<div class="Layout-sc-abc123">
					<div style="transition: opacity 200ms;">
						<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
					</div>
				</div>
				<div data-a-target="chat-scroller"></div>
			</div>
		`);
		const shell = root.querySelector(".chat-shell") as HTMLElement;
		const slot = root.querySelector(".Layout-sc-abc123") as HTMLElement;
		const scroller = root.querySelector(
			"[data-a-target='chat-scroller']",
		) as HTMLElement;

		expect(suppress()()).toBe(1);

		expect(slot.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);
		expect(shell.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(shell.style.getPropertyValue("display")).toBe("");
		expect(scroller.style.getPropertyValue("display")).toBe("");
	});

	it("never collapses a container that still holds the live player video", () => {
		const root = mount(`
			<div id="column">
				<video id="live" src="blob:https://www.twitch.tv/live"></video>
				<div id="adbox">
					<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
				</div>
			</div>
		`);
		const column = root.querySelector("#column") as HTMLElement;
		const adbox = root.querySelector("#adbox") as HTMLElement;
		const live = root.querySelector("#live") as HTMLElement;

		expect(suppress()()).toBe(1);

		expect(adbox.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);
		expect(column.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(column.style.getPropertyValue("display")).toBe("");
		expect(live.style.getPropertyValue("display")).toBe("");
		expect(live.hasAttribute("data-ttvab-independent-ad-suppressed")).toBe(
			false,
		);
	});

	it("stops at the first wrapper that also holds unrelated page content", () => {
		const root = mount(`
			<div id="sidebar">
				<div id="slot">
					<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
				</div>
				<section id="recommended">Recommended channels</section>
			</div>
		`);
		const sidebar = root.querySelector("#sidebar") as HTMLElement;
		const slot = root.querySelector("#slot") as HTMLElement;
		const recommended = root.querySelector("#recommended") as HTMLElement;

		expect(suppress()()).toBe(1);

		expect(slot.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);
		expect(sidebar.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(sidebar.style.getPropertyValue("display")).toBe("");
		expect(recommended.style.getPropertyValue("display")).toBe("");
	});

	it("restores the collapsed container once the slot stops serving an ad", () => {
		const root = mount(`
			<main>
				<div class="stream-display-ad__wrapper"></div>
				<div id="slot" style="display: flex;">
					<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
				</div>
			</main>
		`);
		const slot = root.querySelector("#slot") as HTMLElement;
		const video = root.querySelector("video") as HTMLVideoElement;

		expect(suppress()()).toBe(1);
		expect(slot.style.getPropertyValue("display")).toBe("none");

		video.src = "blob:https://www.twitch.tv/reused-player";
		video.removeAttribute("aria-label");
		expect(
			T<(media: unknown) => boolean>("_suppressIndependentVideoAd")(video),
		).toBe(false);

		expect(slot.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(slot.style.getPropertyValue("display")).toBe("flex");
	});

	it("restores collapsed containers when ad blocking is turned off", () => {
		const root = mount(`
			<main>
				<div class="stream-display-ad__wrapper"></div>
				<div id="slot">
					<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
				</div>
			</main>
		`);
		const slot = root.querySelector("#slot") as HTMLElement;

		expect(suppress()()).toBe(1);
		expect(slot.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);

		setGuardEnabled()(false);

		expect(slot.hasAttribute("data-ttvab-independent-ad-container")).toBe(
			false,
		);
		expect(slot.style.getPropertyValue("display")).toBe("");
	});

	it("recollapses the container when the page strips the marker attribute", () => {
		const root = mount(`
			<main>
				<div class="stream-display-ad__wrapper"></div>
				<div id="slot">
					<video src="https://m.media-amazon.com/creative.mp4" aria-label="Video Advertisement"></video>
				</div>
			</main>
		`);
		const slot = root.querySelector("#slot") as HTMLElement;

		expect(suppress()()).toBe(1);

		slot.removeAttribute("data-ttvab-independent-ad-container");
		slot.style.removeProperty("display");

		T<(node: Node) => number>("_suppressIndependentVideoAdsForNode")(slot);

		expect(slot.getAttribute("data-ttvab-independent-ad-container")).toBe(
			"true",
		);
		expect(slot.style.getPropertyValue("display")).toBe("none");
	});
});

describe("_pruneIndependentVideoAdSuppressions", () => {
	const suppress = () =>
		T<(root?: ParentNode) => number>("_suppressIndependentVideoAdsInDocument");
	const prune = () => T<() => number>("_pruneIndependentVideoAdSuppressions");

	function independentState() {
		return g._IndependentVideoAdSuppressionState as {
			suppressedMedia: Map<HTMLVideoElement, { detachedAt: number | null }>;
		};
	}

	function makeAd() {
		const video = document.createElement("video");
		video.setAttribute("aria-label", "Video Advertisement");
		video.src = "https://m.media-amazon.com/pruned-ad.mp4";
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

	it("keeps a removed ad muted through the grace window so its audio can never resume unseen", () => {
		const ad = makeAd();

		expect(suppress()()).toBe(1);
		ad.video.remove();
		expect(prune()()).toBe(0);

		expect(ad.video.muted).toBe(true);
		expect(ad.pause).not.toHaveBeenCalled();
		expect(independentState().suppressedMedia.size).toBe(1);
	});

	it("pauses and releases an abandoned ad after the grace window without unmuting it", () => {
		const ad = makeAd();
		const graceMs = g._INDEPENDENT_VIDEO_AD_DETACHED_GRACE_MS as number;

		expect(suppress()()).toBe(1);
		ad.video.remove();
		expect(prune()()).toBe(0);
		const entry = independentState().suppressedMedia.get(ad.video);
		expect(entry).toBeDefined();
		if (entry) entry.detachedAt = Date.now() - graceMs - 1;
		expect(prune()()).toBe(1);

		expect(ad.pause).toHaveBeenCalledOnce();
		expect(ad.video.muted).toBe(true);
		expect(ad.video.hasAttribute("data-ttvab-independent-ad-suppressed")).toBe(
			true,
		);
		expect(independentState().suppressedMedia.size).toBe(0);
	});

	it("pauses and releases the last detached ad when no later DOM mutation occurs", async () => {
		vi.useFakeTimers();
		try {
			const ad = makeAd();
			const graceMs = g._INDEPENDENT_VIDEO_AD_DETACHED_GRACE_MS as number;

			expect(suppress()()).toBe(1);
			ad.video.remove();
			expect(prune()()).toBe(0);
			await vi.advanceTimersByTimeAsync(graceMs);

			expect(ad.pause).toHaveBeenCalledOnce();
			expect(independentState().suppressedMedia.size).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("still restores an ad element Twitch reattaches and reuses within the grace window", () => {
		const ad = makeAd();

		expect(suppress()()).toBe(1);
		ad.video.remove();
		expect(prune()()).toBe(0);
		document.body.appendChild(ad.video);
		prune()();
		expect(independentState().suppressedMedia.get(ad.video)?.detachedAt).toBe(
			null,
		);

		ad.video.src = "blob:https://www.twitch.tv/reused-player";
		ad.video.removeAttribute("aria-label");
		expect(
			T<(media: unknown) => boolean>("_suppressIndependentVideoAd")(ad.video),
		).toBe(false);
		expect(ad.video.muted).toBe(false);
		expect(ad.video.style.getPropertyValue("display")).toBe("");
		expect(ad.pause).not.toHaveBeenCalled();
	});
});

describe("_installIndependentVideoAdObserver", () => {
	it("observes the document without requiring a document root", () => {
		const nativeMutationObserver = g.MutationObserver;
		const observe = vi.fn();
		class TestMutationObserver {
			observe = observe;
			disconnect = vi.fn();
		}
		g.MutationObserver = TestMutationObserver;
		try {
			expect(T<() => boolean>("_installIndependentVideoAdObserver")()).toBe(
				true,
			);
			expect(observe).toHaveBeenCalledWith(document, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: [
					"aria-label",
					"src",
					"data-ttvab-independent-ad-container",
				],
			});
		} finally {
			g.MutationObserver = nativeMutationObserver;
			(
				g._IndependentVideoAdSuppressionState as {
					observer: MutationObserver | null;
				}
			).observer = null;
		}
	});

	it("checks a parent video when Twitch adds or changes a source element", () => {
		const video = document.createElement("video");
		const source = document.createElement("source");
		source.src = "https://m.media-amazon.com/mutated-source-ad.mp4";
		video.appendChild(source);
		document.body.appendChild(video);

		expect(
			T<(node: Node) => number>("_suppressIndependentVideoAdsForNode")(source),
		).toBe(1);
		expect(video.style.getPropertyValue("display")).toBe("none");
		expect(video.muted).toBe(true);
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
		T<(element?: HTMLVideoElement | null) => unknown>(
			"_clearActivePictureInPicturePlaybackContext",
		)();
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

	it("restores the new primary before switching suppression contexts", () => {
		const firstPrimary = primary;
		const nextPrimary = makeMedia(true).el;
		expect(sweep()("testchannel", "live:testchannel")).toBe(1);
		expect(nextPrimary.muted).toBe(true);

		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "nextchannel";
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageMediaKey =
			"live:nextchannel";
		primary = nextPrimary;
		expect(sweep()("nextchannel", "live:nextchannel")).toBe(1);

		expect(nextPrimary.muted).toBe(false);
		expect(nextPrimary.volume).toBe(1);
		expect(firstPrimary.muted).toBe(true);
		expect(primary).toBe(nextPrimary);
		expect(suppressionState().suppressedMedia.has(nextPrimary)).toBe(false);
		expect(suppressionState().activeMediaKey).toBe("live:nextchannel");
	});

	it("keeps the exact PiP ad media audible and suppresses the new route player", () => {
		const pip = makeMedia(true).el;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "pagechannel";
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageMediaKey =
			"live:pagechannel";
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pip, {
			MediaType: "live",
			ChannelName: "pipchannel",
			VodID: null,
			MediaKey: "live:pipchannel",
		});
		const resolveMedia = T<
			(
				channel?: string | null,
				mediaKey?: string | null,
			) => HTMLMediaElement | null
		>("_getPlaybackMediaElementForContext");

		expect(resolveMedia("pipchannel", "live:pipchannel")).toBe(pip);
		expect(resolveMedia("pagechannel", "live:pagechannel")).toBe(primary);
		expect(resolveMedia("otherchannel", "live:otherchannel")).toBeNull();
		expect(sweep()("pipchannel", "live:pipchannel")).toBe(1);
		expect(pip.muted).toBe(false);
		expect(primary.muted).toBe(true);
		expect(primary.volume).toBe(0);
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

	it("preserves the active pip stream and scopes worker cleanup when the page navigates", () => {
		navState("live:testchannel");
		const streamInfo = { MediaKey: "live:testchannel" };
		(
			(g.__TTVAB_STATE__ as Record<string, unknown>).StreamInfos as Record<
				string,
				unknown
			>
		)["live:testchannel"] = streamInfo;
		const media = addSuppressed(true);
		suppressionState().activeMediaKey = "live:testchannel";
		const pip = document.createElement("video");
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pip, {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const postMessage = vi.fn();
		(g._S as { workers: unknown[] }).workers = [
			{
				__TTVABPageMediaKey: "live:testchannel",
				postMessage,
			},
		];

		setContext()({ MediaType: "live", ChannelName: "otherchannel" });

		expect(
			(
				(g.__TTVAB_STATE__ as Record<string, unknown>).StreamInfos as Record<
					string,
					unknown
				>
			)["live:testchannel"],
		).toBe(streamInfo);
		expect(media.muted).toBe(true);
		expect(suppressionState().suppressedMedia.size).toBe(1);
		const messages = postMessage.mock.calls.map(
			([envelope]) =>
				(envelope as { message: Record<string, unknown> }).message,
		);
		expect(messages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "UpdatePageContext",
					value: expect.objectContaining({
						mediaKey: "live:otherchannel",
						preservedMediaKey: "live:testchannel",
					}),
				}),
				expect.objectContaining({
					key: "ResetPlaybackRecoveryState",
					value: expect.objectContaining({
						previousMediaKey: "live:testchannel",
						preservedMediaKey: "live:testchannel",
					}),
				}),
			]),
		);
	});
});

describe("_guardPlaybackAcrossVisibilityTransition (watch-context gate)", () => {
	let resumeCalls: unknown[][];
	let scheduleCalls: unknown[][];
	let originalResume: unknown;
	let originalSchedule: unknown;
	let originalHidden: unknown;

	beforeEach(() => {
		resumeCalls = [];
		scheduleCalls = [];
		originalResume = g._resumePrimaryPlaybackIfPaused;
		originalSchedule = g._schedulePlaybackRecoveryTimeout;
		originalHidden = g._isNativeDocumentHidden;
		g._isNativeDocumentHidden = () => false;
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
		g._isNativeDocumentHidden = originalHidden;
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

	it("retries paused playback on an active watch context", () => {
		guard()("testchannel", "live:testchannel");

		expect(resumeCalls).toHaveLength(1);
		expect(resumeCalls[0]).toEqual(["testchannel", "live:testchannel"]);
		expect(scheduleCalls.length).toBeGreaterThan(0);
	});

	it("uses the longer bounded retry horizon while the tab is hidden", () => {
		g._isNativeDocumentHidden = () => true;

		guard()("testchannel", "live:testchannel");

		expect(Math.max(...scheduleCalls.map((call) => Number(call[1]) || 0))).toBe(
			3000,
		);
	});
});

describe("_syncPrimaryMediaPlaybackIntent (unfocused pause recovery)", () => {
	let video: HTMLVideoElement;
	let isPaused: boolean;
	let guardCalls: unknown[][];
	let resumeCalls: unknown[][];
	let adResumeCalls: unknown[][];
	let originalGetPrimary: unknown;
	let originalGuard: unknown;
	let originalResume: unknown;
	let originalUnfocused: unknown;
	let originalAdResume: unknown;

	beforeEach(() => {
		T<() => void>("_clearObservedPlaybackIntentMedia")();
		video = document.createElement("video");
		isPaused = false;
		Object.defineProperty(video, "paused", {
			get: () => isPaused,
			configurable: true,
		});
		Object.defineProperty(video, "ended", {
			get: () => false,
			configurable: true,
		});
		document.body.appendChild(video);

		guardCalls = [];
		resumeCalls = [];
		adResumeCalls = [];
		originalGetPrimary = g._getPrimaryMediaElement;
		originalGuard = g._guardPlaybackAcrossVisibilityTransition;
		originalResume = g._resumePrimaryPlaybackIfPaused;
		originalUnfocused = g._isPlaybackPageUnfocused;
		originalAdResume = g._resumeActivePlayerAfterAd;
		g._getPrimaryMediaElement = () => video;
		g._guardPlaybackAcrossVisibilityTransition = (...args: unknown[]) => {
			guardCalls.push(args);
		};
		g._resumePrimaryPlaybackIfPaused = (...args: unknown[]) => {
			resumeCalls.push(args);
			return true;
		};
		g._isPlaybackPageUnfocused = () => true;
		g._resumeActivePlayerAfterAd = (...args: unknown[]) => {
			adResumeCalls.push(args);
			return true;
		};

		g.__TTVAB_STATE__ = {
			CurrentAdMediaKey: null,
			CurrentAdChannel: null,
			PageMediaType: "live",
			PageMediaKey: "live:testchannel",
			PageChannel: "testchannel",
			ShouldResumeAfterAd: false,
			ShouldResumeAfterAdChannel: null,
			ShouldResumeAfterAdMediaKey: null,
			ShouldResumeAfterAdUntil: 0,
		};
		const intentState = g._PlaybackIntentState as Record<string, unknown>;
		intentState.userPausedMediaKey = null;
		intentState.userPausedAt = 0;
		intentState.userPausedHadExplicitInteraction = false;
		intentState.userPausedDuringAd = false;
		intentState.lastProgrammaticPauseAt = 0;
		intentState.lastPlaybackControlInteractionAt = 0;
		intentState.lastPlaybackControlInteractionMediaKey = null;
		intentState.suppressedPauseMediaKey = null;
		intentState.suppressedPauseUntil = 0;

		T<() => void>("_syncPrimaryMediaPlaybackIntent")();
	});

	afterEach(() => {
		T<() => void>("_clearObservedPlaybackIntentMedia")();
		video.remove();
		g._getPrimaryMediaElement = originalGetPrimary;
		g._guardPlaybackAcrossVisibilityTransition = originalGuard;
		g._resumePrimaryPlaybackIfPaused = originalResume;
		g._isPlaybackPageUnfocused = originalUnfocused;
		g._resumeActivePlayerAfterAd = originalAdResume;
	});

	function pause() {
		isPaused = true;
		video.dispatchEvent(new Event("pause"));
	}

	it("recovers a late environmental pause without recording user intent", () => {
		pause();

		expect(guardCalls).toHaveLength(0);
		expect(resumeCalls).toEqual([["testchannel", "live:testchannel"]]);
		expect(adResumeCalls).toHaveLength(0);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>).userPausedMediaKey,
		).toBeNull();
	});

	it("keeps an explicit pause authoritative while the page is unfocused", () => {
		const intentState = g._PlaybackIntentState as Record<string, unknown>;
		intentState.lastPlaybackControlInteractionAt = Date.now();
		intentState.lastPlaybackControlInteractionMediaKey = "live:testchannel";

		pause();

		expect(guardCalls).toHaveLength(0);
		expect(resumeCalls).toHaveLength(0);
		expect(adResumeCalls).toHaveLength(0);
		expect(intentState.userPausedMediaKey).toBe("live:testchannel");
		expect(intentState.userPausedHadExplicitInteraction).toBe(true);
	});

	it("keeps an operating-system media-session pause authoritative while unfocused", () => {
		const savedMediaSession = Object.getOwnPropertyDescriptor(
			navigator,
			"mediaSession",
		);
		const savedPatched = window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__;
		let pauseHandler: ((details: { action: string }) => void) | null = null;
		const mediaSession = {
			setActionHandler(
				action: string,
				handler: ((details: { action: string }) => void) | null,
			) {
				if (action === "pause") pauseHandler = handler;
			},
		};
		Object.defineProperty(navigator, "mediaSession", {
			value: mediaSession,
			configurable: true,
		});
		window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__ = false;

		try {
			T<() => boolean>("_hookMediaSessionPlaybackIntent")();
			mediaSession.setActionHandler("pause", () => {});
			pauseHandler?.({ action: "pause" });
			pause();

			const intentState = g._PlaybackIntentState as Record<string, unknown>;
			expect(resumeCalls).toHaveLength(0);
			expect(intentState.userPausedMediaKey).toBe("live:testchannel");
			expect(intentState.userPausedHadExplicitInteraction).toBe(true);
		} finally {
			if (savedMediaSession) {
				Object.defineProperty(navigator, "mediaSession", savedMediaSession);
			} else {
				delete (navigator as unknown as Record<string, unknown>).mediaSession;
			}
			window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__ = savedPatched;
		}
	});

	it("uses the existing ad resume intent gate for an unfocused ad-time pause", () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = "live:testchannel";
		state.CurrentAdChannel = "testchannel";
		state.ShouldResumeAfterAd = true;
		state.ShouldResumeAfterAdChannel = "testchannel";
		state.ShouldResumeAfterAdMediaKey = "live:testchannel";
		state.ShouldResumeAfterAdUntil = Date.now() + 10000;

		pause();

		expect(guardCalls).toHaveLength(0);
		expect(resumeCalls).toHaveLength(0);
		expect(adResumeCalls).toEqual([["testchannel", "live:testchannel"]]);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>).userPausedMediaKey,
		).toBeNull();
	});

	it("does not spawn retry batches when environmental pauses repeat", () => {
		pause();
		pause();

		expect(guardCalls).toHaveLength(0);
		expect(resumeCalls).toEqual([
			["testchannel", "live:testchannel"],
			["testchannel", "live:testchannel"],
		]);
	});

	it("keeps a late control-free unfocused pause environmental", () => {
		pause();

		expect(resumeCalls).toEqual([["testchannel", "live:testchannel"]]);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>).userPausedMediaKey,
		).toBeNull();
	});
});

describe("_hookVisibilityState (focus and page lifecycle)", () => {
	let guardCalls: unknown[][];
	let originalGuard: unknown;

	beforeEach(() => {
		guardCalls = [];
		originalGuard = g._guardPlaybackAcrossVisibilityTransition;
		g._guardPlaybackAcrossVisibilityTransition = (...args: unknown[]) => {
			guardCalls.push(args);
		};
		g.__TTVAB_STATE__ = {
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
		};
		(
			window as unknown as Record<string, unknown>
		).__TTVAB_VISIBILITY_HARDENED__ = false;
	});

	afterEach(() => {
		window.dispatchEvent(new Event("pagehide"));
		g._guardPlaybackAcrossVisibilityTransition = originalGuard;
	});

	it("recovers on focus and reinstalls its listeners after a page restore", () => {
		T<() => void>("_hookVisibilityState")();

		window.dispatchEvent(new Event("focus"));
		expect(guardCalls).toEqual([["testchannel", "live:testchannel"]]);

		window.dispatchEvent(new Event("pagehide"));
		document.dispatchEvent(new Event("visibilitychange"));
		expect(guardCalls).toHaveLength(1);

		window.dispatchEvent(new Event("pageshow"));
		document.dispatchEvent(new Event("visibilitychange"));
		expect(guardCalls).toEqual([
			["testchannel", "live:testchannel"],
			["testchannel", "live:testchannel"],
			["testchannel", "live:testchannel"],
		]);
	});
});
