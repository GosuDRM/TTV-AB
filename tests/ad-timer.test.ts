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

const g = globalThis as unknown as {
	_adTimerEnabled: boolean;
	_onInternalMessage: (
		type: string,
		handler: (detail: unknown) => void,
	) => void;
	_initToggleListener: () => void;
	_clearAdTimerOverlay: () => void;
	_updateAdTimerOverlay: () => void;
	_getPlayerAndState: () => {
		player: { getHTMLVideoElement: () => HTMLVideoElement } | null;
		state?: {
			props: {
				content: { type: string; channelLogin?: string; vodID?: string };
			};
		};
	};
	_broadcastWorkers: ReturnType<typeof vi.fn>;
	_log: ReturnType<typeof vi.fn>;
	__TTVAB_STATE__: {
		IsAdStrippingEnabled: boolean;
		PageMediaKey: string;
		CurrentAdMediaKey: string | null;
		LastAdDetectedAt?: number;
		AdPodProgressByMediaKey: Record<string, { cycleStartedAt: number }>;
	};
};
const handlers = new Map<string, (detail: unknown) => void>();
let video: HTMLVideoElement;
const now = 1800000000000;

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/hooks.js");
	loadModule("../dist/src/modules/ui.js");
	loadModule("../dist/src/modules/init.js");
	g._onInternalMessage = (type: string, handler: (detail: unknown) => void) => {
		handlers.set(type, handler);
	};
	g._initToggleListener();
});

beforeEach(() => {
	vi.useFakeTimers({ now });
	document.body.replaceChildren();
	g._adTimerEnabled = false;
	g.__TTVAB_STATE__ = {
		IsAdStrippingEnabled: true,
		PageMediaKey: "live:example",
		CurrentAdMediaKey: "live:example",
		AdPodProgressByMediaKey: {
			"live:example": { cycleStartedAt: now - 83000 },
		},
	};
	video = document.createElement("video");
	document.body.append(video);
	vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
		x: 10,
		y: 50,
		left: 10,
		top: 50,
		right: 810,
		bottom: 500,
		width: 800,
		height: 450,
		toJSON() {},
	});
	g._getPlayerAndState = () => ({
		player: { getHTMLVideoElement: () => video },
		state: { props: { content: { type: "live", channelLogin: "example" } } },
	});
	g._broadcastWorkers = vi.fn();
	g._log = vi.fn();
	Object.defineProperty(document, "fullscreenElement", {
		value: null,
		configurable: true,
	});
	Object.defineProperty(document, "pictureInPictureElement", {
		value: null,
		configurable: true,
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	g._clearAdTimerOverlay();
	vi.useRealTimers();
});

function toggle(enabled: unknown) {
	handlers.get("ttvab-toggle-ad-timer")?.({ enabled });
}

function overlay() {
	return document.getElementById("ttvab-ad-timer");
}

describe("opt-in ad break timer", () => {
	it("does not put the current break timer over a replacement playing another stream", () => {
		toggle(true);
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => video },
			state: { props: { content: { type: "live", channelLogin: "another" } } },
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("hides while replacement player ownership is unknown", () => {
		toggle(true);
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => video },
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("matches VOD identity independently of the surrounding channel", () => {
		g.__TTVAB_STATE__.PageMediaKey = "vod:123";
		g.__TTVAB_STATE__.CurrentAdMediaKey = "vod:123";
		g.__TTVAB_STATE__.AdPodProgressByMediaKey = {
			"vod:123": { cycleStartedAt: now - 83000 },
		};
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => video },
			state: {
				props: {
					content: { type: "vod", channelLogin: "example", vodID: "123" },
				},
			},
		});
		toggle(true);
		expect(overlay()?.textContent).toBe("Ad break · 1:23 elapsed");
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => video },
			state: {
				props: {
					content: { type: "vod", channelLogin: "example", vodID: "456" },
				},
			},
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("does not float above a hidden video that retains its layout box", () => {
		toggle(true);
		video.style.visibility = "hidden";
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("contains DOM cleanup failures so disabling the timer cannot interrupt playback", () => {
		toggle(true);
		const lookup = vi
			.spyOn(document, "getElementById")
			.mockImplementation(() => {
				throw new Error("DOM access failed");
			});
		try {
			expect(() => toggle(false)).not.toThrow();
			expect(() => g._clearAdTimerOverlay()).not.toThrow();
		} finally {
			lookup.mockRestore();
		}
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("defaults off and toggles during a break without playback messages or timers", () => {
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		toggle(true);
		expect(overlay()?.textContent).toBe("Ad break · 1:23 elapsed");
		expect(overlay()?.style.pointerEvents).toBe("none");
		expect(overlay()?.getAttribute("aria-live")).toBe("off");
		expect(overlay()?.style.top).toBe("62px");
		expect(overlay()?.style.right).toBe(`${window.innerWidth - 810 + 12}px`);
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		toggle(false);
		expect(overlay()).toBeNull();
	});

	it("ignores non-boolean settings", () => {
		for (const enabled of ["true", 1, null, {}, undefined]) toggle(enabled);
		expect(overlay()).toBeNull();
	});

	it("keeps counting the original break while toggled off and never duplicates the overlay", () => {
		const originalState = structuredClone(g.__TTVAB_STATE__);
		vi.advanceTimersByTime(17000);
		toggle(true);
		expect(overlay()?.textContent).toBe("Ad break · 1:40 elapsed");
		toggle(false);
		vi.advanceTimersByTime(21000);
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		for (const enabled of [true, true, false, false, true, false, true]) {
			toggle(enabled);
			expect(document.querySelectorAll("#ttvab-ad-timer")).toHaveLength(
				enabled ? 1 : 0,
			);
			if (enabled)
				expect(overlay()?.textContent).toBe("Ad break · 2:01 elapsed");
		}
		expect(g.__TTVAB_STATE__).toEqual(originalState);
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not revive a completed break and shows the next break while left enabled", () => {
		toggle(true);
		toggle(false);
		g.__TTVAB_STATE__.CurrentAdMediaKey = null;
		vi.advanceTimersByTime(30000);
		toggle(true);
		expect(overlay()).toBeNull();
		g.__TTVAB_STATE__.CurrentAdMediaKey = "live:example";
		g.__TTVAB_STATE__.AdPodProgressByMediaKey["live:example"].cycleStartedAt =
			Date.now();
		vi.advanceTimersByTime(4000);
		g._updateAdTimerOverlay();
		expect(overlay()?.textContent).toBe("Ad break · 0:04 elapsed");
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
	});

	it("preserves the timer preference across main blocking toggles without reviving the cleared cycle", () => {
		toggle(true);
		handlers.get("ttvab-toggle")?.({ enabled: false });
		expect(overlay()).toBeNull();
		expect(g._adTimerEnabled).toBe(true);
		expect(g.__TTVAB_STATE__.CurrentAdMediaKey).toBeNull();
		expect(g.__TTVAB_STATE__.AdPodProgressByMediaKey).toEqual({});
		vi.advanceTimersByTime(20000);
		handlers.get("ttvab-toggle")?.({ enabled: true });
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		g.__TTVAB_STATE__.CurrentAdMediaKey = "live:example";
		g.__TTVAB_STATE__.AdPodProgressByMediaKey["live:example"] = {
			cycleStartedAt: Date.now(),
		};
		g._updateAdTimerOverlay();
		expect(overlay()?.textContent).toBe("Ad break · 0:00 elapsed");
	});

	it("counts from the owned cycle across repeated detections and worker replacement", () => {
		toggle(true);
		const original = overlay();
		vi.advanceTimersByTime(37000);
		g.__TTVAB_STATE__.LastAdDetectedAt = Date.now();
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => video },
			state: { props: { content: { type: "live", channelLogin: "example" } } },
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBe(original);
		expect(overlay()?.textContent).toBe("Ad break · 2:00 elapsed");
		g.__TTVAB_STATE__.AdPodProgressByMediaKey["live:example"].cycleStartedAt =
			Date.now();
		g._updateAdTimerOverlay();
		expect(overlay()?.textContent).toBe("Ad break · 0:00 elapsed");
		expect(document.querySelectorAll("#ttvab-ad-timer")).toHaveLength(1);
	});

	it.each([
		"disabled",
		"ended",
		"navigation",
		"missing cycle",
		"future cycle",
		"invalid cycle",
	])("removes the overlay for %s", (reason) => {
		toggle(true);
		const state = g.__TTVAB_STATE__;
		if (reason === "disabled") state.IsAdStrippingEnabled = false;
		if (reason === "ended") state.CurrentAdMediaKey = null;
		if (reason === "navigation") state.PageMediaKey = "live:another";
		if (reason === "missing cycle") state.AdPodProgressByMediaKey = {};
		if (reason === "future cycle")
			state.AdPodProgressByMediaKey["live:example"].cycleStartedAt = now + 1000;
		if (reason === "invalid cycle")
			state.AdPodProgressByMediaKey["live:example"].cycleStartedAt = Number.NaN;
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("follows a connected replacement and hides when the primary player disappears", () => {
		toggle(true);
		video.remove();
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		const replacement = document.createElement("video");
		document.body.append(replacement);
		vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue(
			video.getBoundingClientRect(),
		);
		g._getPlayerAndState = () => ({
			player: { getHTMLVideoElement: () => replacement },
			state: { props: { content: { type: "live", channelLogin: "example" } } },
		});
		g._updateAdTimerOverlay();
		expect(overlay()?.textContent).toBe("Ad break · 1:23 elapsed");
		g._getPlayerAndState = () => ({ player: null });
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("keeps the timer in the fullscreen player and hides for native video PiP", () => {
		const host = document.createElement("div");
		document.body.append(host);
		host.append(video);
		Object.defineProperty(document, "fullscreenElement", {
			value: host,
			configurable: true,
		});
		toggle(true);
		expect(overlay()?.parentElement).toBe(host);
		Object.defineProperty(document, "fullscreenElement", {
			value: null,
			configurable: true,
		});
		g._updateAdTimerOverlay();
		expect(overlay()?.parentElement).toBe(document.body);
		Object.defineProperty(document, "pictureInPictureElement", {
			value: video,
			configurable: true,
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
	});

	it("hides outside the visible stream without affecting playback on resolver failure", () => {
		toggle(true);
		vi.mocked(video.getBoundingClientRect).mockReturnValue({
			...video.getBoundingClientRect(),
			top: -100,
		});
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		g._getPlayerAndState = () => {
			throw new Error("player remount");
		};
		expect(() => g._updateAdTimerOverlay()).not.toThrow();
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
	});
});
