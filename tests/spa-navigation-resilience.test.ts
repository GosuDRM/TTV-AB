import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModule, T } from "./helpers/runtime";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	loadModule("../dist/src/modules/logger.js");
	loadModule("../dist/src/modules/init.js");
	loadModule("../dist/src/modules/ui.js");
});

beforeEach(() => {
	window.dispatchEvent(new Event("pagehide"));
});

describe("_hookSpaNavigation resilience", () => {
	it("completes Twitch's navigation when the context sync throws", () => {
		const previousLog = g._log;
		const log = vi.fn();
		g._log = log;
		g._syncPagePlaybackContext = () => {
			throw new Error("broken route state");
		};
		try {
			T<() => void>("_hookSpaNavigation")();
			expect(() =>
				history.pushState({ step: 1 }, "", "/throwingchannel"),
			).not.toThrow();
			expect(window.location.pathname).toBe("/throwingchannel");
			expect(history.state).toEqual({ step: 1 });
			expect(log).toHaveBeenCalledWith(
				"Navigation sync failed: broken route state",
				"warning",
			);
		} finally {
			g._log = previousLog;
		}
	});

	it("keeps a later history wrapper installed when the page is hidden", () => {
		const calls: unknown[] = [];
		g._syncPagePlaybackContext = (options: unknown) => {
			calls.push(options);
			return null;
		};
		T<() => void>("_hookSpaNavigation")();
		const ours = history.pushState;
		const wrapped: string[] = [];
		const laterWrapper = function (
			this: History,
			...args: Parameters<History["pushState"]>
		) {
			wrapped.push(String(args[2]));
			return ours.apply(this, args);
		};
		history.pushState = laterWrapper;
		try {
			window.dispatchEvent(new Event("pagehide"));
			expect(history.pushState).toBe(laterWrapper);
			history.pushState(null, "", "/wrappedchannel");
			expect(wrapped).toEqual(["/wrappedchannel"]);
			expect(calls).toEqual([{ broadcast: true }]);
		} finally {
			history.pushState = ours;
		}
	});

	it("clears the ad timer only when navigation changes the playing media", () => {
		const scoped = globalThis as Record<string, unknown>;
		const previousState = scoped.__TTVAB_STATE__;
		const previousClear = g._clearAdTimerOverlay;
		const clearOverlay = vi.fn();
		g._clearAdTimerOverlay = clearOverlay;
		scoped.__TTVAB_STATE__ = { PageMediaKey: "live:first" };
		g._syncPagePlaybackContext = () => {
			const channel = window.location.pathname.split("/")[1];
			(scoped.__TTVAB_STATE__ as Record<string, unknown>).PageMediaKey =
				`live:${channel}`;
			return null;
		};
		try {
			history.replaceState(null, "", "/first");
			T<() => void>("_hookSpaNavigation")();
			history.replaceState({ scroll: 1 }, "", "/first?ref=sidebar");
			expect(clearOverlay).not.toHaveBeenCalled();
			history.pushState(null, "", "/second");
			expect(clearOverlay).toHaveBeenCalledOnce();
		} finally {
			scoped.__TTVAB_STATE__ = previousState;
			g._clearAdTimerOverlay = previousClear;
		}
	});
});
