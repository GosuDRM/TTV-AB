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
});
