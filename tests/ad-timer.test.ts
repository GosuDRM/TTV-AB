import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { loadModule } from "./helpers/runtime";

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
let defaultTimerEnabled: boolean;
const now = 1800000000000;

beforeAll(() => {
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/hooks.js");
	loadModule("../dist/src/modules/ui.js");
	defaultTimerEnabled = g._adTimerEnabled;
	loadModule("../dist/src/modules/init.js");
	g._onInternalMessage = (type: string, handler: (detail: unknown) => void) => {
		handlers.set(type, handler);
	};
	g._initToggleListener();
});

beforeEach(() => {
	vi.useFakeTimers({ now });
	document.body.replaceChildren();
	g._adTimerEnabled = defaultTimerEnabled;
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

describe("ad break timer", () => {
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
		expect(overlay()?.textContent).toBe("Ad break · 1:23");
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

	it("defaults off and toggles during a break without playback messages or lingering timers", () => {
		expect(g._adTimerEnabled).toBe(false);
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		toggle(true);
		expect(overlay()?.textContent).toBe("Ad break · 1:23");
		expect(overlay()?.style.pointerEvents).toBe("none");
		expect(overlay()?.getAttribute("aria-live")).toBe("off");
		expect(overlay()?.style.top).toBe("62px");
		expect(overlay()?.style.right).toBe(`${window.innerWidth - 810 + 12}px`);
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		toggle(false);
		expect(overlay()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ignores non-boolean settings", () => {
		toggle(false);
		for (const enabled of ["true", 1, null, {}, undefined]) toggle(enabled);
		expect(overlay()).toBeNull();
	});

	it("keeps counting the original break while toggled off and never duplicates the overlay", () => {
		const originalState = structuredClone(g.__TTVAB_STATE__);
		vi.advanceTimersByTime(17000);
		toggle(true);
		expect(overlay()?.textContent).toBe("Ad break · 1:40");
		toggle(false);
		vi.advanceTimersByTime(21000);
		g._updateAdTimerOverlay();
		expect(overlay()).toBeNull();
		for (const enabled of [true, true, false, false, true, false, true]) {
			toggle(enabled);
			expect(document.querySelectorAll("#ttvab-ad-timer")).toHaveLength(
				enabled ? 1 : 0,
			);
			if (enabled) expect(overlay()?.textContent).toBe("Ad break · 2:01");
		}
		expect(g.__TTVAB_STATE__).toEqual(originalState);
		expect(g._broadcastWorkers).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		toggle(false);
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
		expect(overlay()?.textContent).toBe("Ad break · 0:04");
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
		expect(overlay()?.textContent).toBe("Ad break · 0:00");
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
		expect(overlay()?.textContent).toBe("Ad break · 2:00");
		g.__TTVAB_STATE__.AdPodProgressByMediaKey["live:example"].cycleStartedAt =
			Date.now();
		g._updateAdTimerOverlay();
		expect(overlay()?.textContent).toBe("Ad break · 0:00");
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
		expect(overlay()?.textContent).toBe("Ad break · 1:23");
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
			top: -420,
			bottom: 30,
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

describe("ad break timer updates", () => {
	const setHidden = (hidden: boolean) => {
		g._isNativeDocumentHidden = () => hidden;
	};

	afterEach(() => {
		delete g._isNativeDocumentHidden;
		g._setPageLanguagePreference("auto", "");
	});

	it("advances exactly once per second while the break is shown", () => {
		toggle(true);
		const seen = [overlay()?.textContent];
		for (let i = 0; i < 4; i++) {
			vi.advanceTimersToNextTimer();
			seen.push(overlay()?.textContent);
		}
		expect(seen).toEqual([
			"Ad break · 1:23",
			"Ad break · 1:24",
			"Ad break · 1:25",
			"Ad break · 1:26",
			"Ad break · 1:27",
		]);
		expect(vi.getTimerCount()).toBe(1);
	});

	it("disappears within a second of the break ending", () => {
		toggle(true);
		g.__TTVAB_STATE__.CurrentAdMediaKey = null;
		vi.advanceTimersByTime(1100);
		expect(overlay()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("pauses its updates in a background tab and catches up when the tab returns", () => {
		setHidden(true);
		toggle(true);
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(40000);
		expect(overlay()?.textContent).toBe("Ad break · 1:23");

		setHidden(false);
		window.dispatchEvent(new Event("visibilitychange"));
		expect(overlay()?.textContent).toBe("Ad break · 2:03");
		expect(vi.getTimerCount()).toBe(1);
	});

	it("still refreshes when another script stops visibility events at the document", () => {
		const swallow = (event: Event) => event.stopImmediatePropagation();
		document.addEventListener("visibilitychange", swallow, true);
		try {
			setHidden(true);
			toggle(true);
			vi.advanceTimersByTime(5000);
			setHidden(false);
			document.dispatchEvent(new Event("visibilitychange"));
			expect(overlay()?.textContent).toBe("Ad break · 1:28");
		} finally {
			document.removeEventListener("visibilitychange", swallow, true);
		}
	});

	it("moves into the fullscreen player as soon as fullscreen starts", () => {
		toggle(true);
		const player = document.createElement("div");
		document.body.append(player);
		player.append(video);
		Object.defineProperty(document, "fullscreenElement", {
			value: player,
			configurable: true,
		});
		document.dispatchEvent(new Event("fullscreenchange"));
		expect(overlay()?.parentElement).toBe(player);
	});

	it("stops listening for page changes once the timer is hidden", () => {
		toggle(true);
		const remove = vi.spyOn(window, "removeEventListener");
		toggle(false);
		expect(remove).toHaveBeenCalledWith(
			"visibilitychange",
			expect.any(Function),
			true,
		);
	});

	it("marks its text with the language it is written in", () => {
		g._setPageLanguagePreference("de", "");
		toggle(true);
		expect(overlay()?.lang).toBe("de");
		expect(overlay()?.textContent).toBe("Werbepause · 1:23");
	});

	it("stays at the visible top of a stream that is partly scrolled out of view", () => {
		vi.mocked(video.getBoundingClientRect).mockReturnValue({
			...video.getBoundingClientRect(),
			top: -100,
			bottom: 350,
		});
		toggle(true);
		expect(overlay()?.style.top).toBe("12px");
	});
});

describe("Low Quality Fallback toggle log", () => {
	it.each([
		[false, "Low quality fallback disabled", "info"],
		[true, "Low quality fallback enabled", "success"],
	])("logs enabled=%s without a console warning", (enabled, message, level) => {
		handlers.get("ttvab-toggle-autoplay-backup")?.({ enabled });
		expect(g._log).toHaveBeenCalledExactlyOnceWith(message, level);
		expect(g._broadcastWorkers).toHaveBeenCalledExactlyOnceWith({
			key: "UpdateAutoplayBackupState",
			value: !enabled,
		});
	});
});
