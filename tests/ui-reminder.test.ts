import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { loadModule, T } from "./helpers/runtime";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	loadModule("../dist/src/modules/ui.js");
});

const DAY = 86400000;
const NEXT_KEY = "ttvab_next_reminder";
const LAST_KEY = "ttvab_last_reminder";

describe("donation reminder", () => {
	const NOW = 1000000000000;
	const STATE_KEY = "ttvab_reminder_state";
	const CADENCE_KEY = "ttvab_reminder_cadence";
	let hidden = false;
	const reminder = () => document.getElementById("ttvab-reminder");
	const state = () => JSON.parse(localStorage.getItem(STATE_KEY) || "null");
	const setCount = (count: number) => {
		g._S = { adsBlocked: count };
		(g.__TTVAB_STATE__ as Record<string, unknown>).HasResolvedAdsCountState =
			true;
	};
	const load = () => {
		T<() => void>("_showDonation")();
		vi.advanceTimersByTime(5000);
	};
	const saveState = (values: Record<string, unknown>) =>
		localStorage.setItem(
			STATE_KEY,
			JSON.stringify({
				nextAt: NOW - 1,
				shownCount: 0,
				supported: false,
				baseline: 0,
				since: NOW - 30 * DAY,
				...values,
			}),
		);

	beforeEach(() => {
		g._log = () => {};
		for (const key of [STATE_KEY, NEXT_KEY, LAST_KEY, CADENCE_KEY])
			localStorage.removeItem(key);
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
		reminder()?.remove();
		vi.useFakeTimers({ now: NOW });
		g.__TTVAB_STATE__ = { HasResolvedAdsCountState: false };
		g._S = { adsBlocked: 0 };
		hidden = false;
		g._isNativeDocumentHidden = () => hidden;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		reminder()?.remove();
		delete g._isNativeDocumentHidden;
		delete (document as unknown as Record<string, unknown>).fullscreenElement;
		for (const key of [STATE_KEY, NEXT_KEY, LAST_KEY, CADENCE_KEY])
			localStorage.removeItem(key);
	});

	it("waits two weeks after install and remembers the starting ad count", () => {
		setCount(3);
		load();

		expect(reminder()).toBeNull();
		expect(state()).toEqual({
			nextAt: NOW + 14 * DAY,
			shownCount: 0,
			supported: false,
			baseline: 3,
			since: NOW + 5000,
		});
	});

	it("waits for 20 more blocked ads even after the date passes, then shows the count", () => {
		setCount(3);
		load();
		vi.setSystemTime(NOW + 15 * DAY);
		setCount(22);
		load();
		expect(reminder()).toBeNull();

		setCount(23);
		load();
		expect(reminder()).not.toBeNull();
		expect(reminder()?.querySelector(".sub")?.textContent).toContain(
			"blocked 20 ads for you since September 9",
		);
		expect(
			String(
				(reminder()?.querySelector("img.mark") as HTMLImageElement | null)
					?.src || "",
			).startsWith("data:image/png;base64,"),
		).toBe(true);
	});

	it("waits longer after each reminder, up to 90 days", () => {
		saveState({});
		let count = 0;
		for (const days of [28, 56, 90, 90]) {
			vi.setSystemTime(state().nextAt);
			count += 20;
			setCount(count);
			load();
			expect(reminder()).not.toBeNull();
			expect(state().nextAt - Date.now()).toBe(days * DAY);
			expect(state().baseline).toBe(count);
			reminder()?.remove();
		}
	});

	it("waits 120 days after the viewer chooses to support", () => {
		saveState({});
		setCount(20);
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		load();
		reminder()?.querySelector<HTMLElement>("#ttvab-reminder-btn")?.click();

		expect(open).toHaveBeenCalledWith(
			"https://ko-fi.com/gosudrm",
			"_blank",
			"noopener,noreferrer",
		);
		expect(reminder()).toBeNull();
		expect(state()).toMatchObject({
			supported: true,
			nextAt: NOW + 5000 + 120 * DAY,
		});
		vi.setSystemTime(state().nextAt);
		setCount(40);
		load();
		expect(reminder()).not.toBeNull();
		expect(state().nextAt - Date.now()).toBe(120 * DAY);
	});

	it.each([
		["the tab is hidden", () => (hidden = true)],
		[
			"the player is fullscreen",
			() =>
				Object.defineProperty(document, "fullscreenElement", {
					configurable: true,
					get: () => document.body,
				}),
		],
		[
			"an ad break is being blocked",
			() =>
				Object.assign(g.__TTVAB_STATE__ as Record<string, unknown>, {
					CurrentAdMediaKey: "live:test",
				}),
		],
	])("keeps the reminder for later while %s", (_name, block) => {
		saveState({});
		setCount(25);
		block();
		load();
		vi.advanceTimersByTime(120000);

		expect(reminder()).toBeNull();
		expect(state().nextAt).toBe(NOW - 1);
		expect(state().shownCount).toBe(0);
	});

	it("stays hidden and keeps its schedule while statistics are paused", () => {
		saveState({});
		setCount(25);
		T<(paused: boolean) => void>("_setPageStatsPaused")(true);
		try {
			load();
			vi.advanceTimersByTime(120000);
			expect(reminder()).toBeNull();
			expect(state()).toMatchObject({ nextAt: NOW - 1, shownCount: 0 });
		} finally {
			T<(paused: boolean) => void>("_setPageStatsPaused")(false);
		}
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
		load();
		expect(reminder()).not.toBeNull();
	});

	it("shows on a later check once the tab is visible again", () => {
		saveState({});
		setCount(25);
		hidden = true;
		load();
		hidden = false;
		vi.advanceTimersByTime(59999);
		expect(reminder()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(reminder()).not.toBeNull();
	});

	it("does not show again when another tab showed it first", () => {
		saveState({});
		setCount(25);
		T<() => void>("_showDonation")();
		saveState({ nextAt: NOW + 28 * DAY, shownCount: 1, baseline: 25 });
		vi.advanceTimersByTime(5000);

		expect(reminder()).toBeNull();
	});

	it("starts counting again after statistics are reset", () => {
		saveState({ baseline: 500 });
		setCount(30);
		load();

		expect(reminder()).toBeNull();
		expect(state()).toMatchObject({ baseline: 30, since: NOW + 5000 });
	});

	it.each([
		[{ [NEXT_KEY]: String(NOW + 3 * DAY) }, NOW + 3 * DAY, false],
		[{ [LAST_KEY]: String(NOW - 2 * DAY) }, NOW + 12 * DAY, false],
		[
			{ [NEXT_KEY]: String(NOW + 3 * DAY), [CADENCE_KEY]: "steady" },
			NOW + 120 * DAY,
			true,
		],
	])(
		"keeps the schedule from older versions %j",
		(legacy, nextAt, supported) => {
			for (const [key, value] of Object.entries(legacy))
				localStorage.setItem(key, value);
			T<() => void>("_showDonation")();

			expect(state()).toMatchObject({ nextAt, supported, shownCount: 0 });
		},
	);

	it("repairs a corrupted far-future date instead of never showing", () => {
		saveState({ nextAt: NOW + 400 * DAY });
		T<() => void>("_showDonation")();

		expect(state().nextAt).toBe(NOW + 14 * DAY);
	});
});

describe("achievement toast motion", () => {
	beforeEach(() => {
		g._log = () => {};
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
		document.getElementById("ttvab-achievement")?.remove();
		document.getElementById("ttvab-achievement-style")?.remove();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.getElementById("ttvab-achievement")?.remove();
	});

	it("stops its animations for reduced motion and keeps the hidden end state until removal", async () => {
		vi.useFakeTimers();
		T<(id: string) => void>("_showAchievementUnlocked")("channels_50");
		const toast = document.getElementById("ttvab-achievement");
		const css = document.getElementById("ttvab-achievement-style")?.textContent;
		expect(toast).not.toBeNull();
		expect(css).toContain(
			"#ttvab-achievement.leaving{animation:ttvab-ach-pop .5s ease reverse forwards}",
		);
		expect(css).toContain(
			"@media (prefers-reduced-motion:reduce){#ttvab-achievement,#ttvab-achievement .ach-icon,#ttvab-achievement .ach-name{animation:none}#ttvab-achievement.leaving{animation:none;visibility:hidden}}",
		);
		await vi.advanceTimersByTimeAsync(5000);
		expect(toast?.classList.contains("leaving")).toBe(true);
		expect(toast?.style.animation).toBe("");
		expect(toast?.isConnected).toBe(true);
		await vi.advanceTimersByTimeAsync(500);
		expect(toast?.isConnected).toBe(false);
	});
});

describe("pop-ups inside embedded players", () => {
	const ids = ["ttvab-welcome", "ttvab-reminder", "ttvab-achievement"];
	const REMINDER_STATE_KEY = "ttvab_reminder_state";
	const DUE_REMINDER = JSON.stringify({
		nextAt: 1,
		shownCount: 0,
		supported: false,
		baseline: 0,
		since: 1,
	});
	const showAll = () => {
		T<() => void>("_showWelcome")();
		T<() => void>("_showDonation")();
		vi.advanceTimersByTime(5000);
		T<(id: string) => void>("_showAchievementUnlocked")("first_block");
	};

	beforeEach(() => {
		g._log = () => {};
		vi.useFakeTimers();
		localStorage.removeItem("ttvab_first_run_shown");
		localStorage.setItem(REMINDER_STATE_KEY, DUE_REMINDER);
		g.__TTVAB_STATE__ = { HasResolvedAdsCountState: true };
		g._S = { adsBlocked: 25 };
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		for (const id of ids) document.getElementById(id)?.remove();
		localStorage.removeItem("ttvab_first_run_shown");
		localStorage.removeItem(REMINDER_STATE_KEY);
	});

	it("shows the welcome, reminder, and achievement on the top-level page", () => {
		showAll();
		for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
	});

	it("shows none of them inside a frame embedded in another page", () => {
		vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
		showAll();
		for (const id of ids) expect(document.getElementById(id)).toBeNull();
		expect(localStorage.getItem("ttvab_first_run_shown")).toBeNull();
		expect(localStorage.getItem(REMINDER_STATE_KEY)).toBe(DUE_REMINDER);
	});
});

describe("pop-ups in the chosen language", () => {
	const setLanguage = (choice: string) =>
		T<(choice: string, uiLanguage: string) => void>(
			"_setPageLanguagePreference",
		)(choice, "");

	beforeEach(() => {
		g._log = () => {};
		vi.useFakeTimers({ now: 1000000000000 });
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
		localStorage.removeItem("ttvab_first_run_shown");
	});

	afterEach(() => {
		setLanguage("auto");
		vi.useRealTimers();
		vi.restoreAllMocks();
		for (const id of ["ttvab-welcome", "ttvab-reminder", "ttvab-achievement"])
			document.getElementById(id)?.remove();
		localStorage.removeItem("ttvab_first_run_shown");
		localStorage.removeItem("ttvab_reminder_state");
	});

	it("shows the welcome message in German", () => {
		setLanguage("de");
		T<() => void>("_showWelcome")();
		vi.advanceTimersByTime(5000);
		const toast = document.getElementById("ttvab-welcome");
		expect(toast?.lang).toBe("de");
		expect(toast?.querySelector(".title")?.textContent).toBe("Alles bereit");
		expect(toast?.querySelector(".pill")?.textContent).toBe("Aktiv");
		expect(
			toast?.querySelector("#ttvab-welcome-close")?.getAttribute("aria-label"),
		).toBe("Schließen");
	});

	it("shows achievements with the same Japanese names as the popup", () => {
		setLanguage("ja");
		T<(id: string) => void>("_showAchievementUnlocked")("first_block");
		const toast = document.getElementById("ttvab-achievement");
		expect(toast?.querySelector(".ach-label")?.textContent).toBe(
			"実績を解除しました！",
		);
		expect(toast?.querySelector(".ach-name")?.textContent).toBe("広告ハンター");
	});

	it("shows the donation reminder in Russian with local number and date formats", () => {
		setLanguage("ru");
		localStorage.setItem(
			"ttvab_reminder_state",
			JSON.stringify({
				nextAt: 1,
				shownCount: 0,
				supported: false,
				baseline: 0,
				since: Date.UTC(2026, 8, 1, 12),
			}),
		);
		g.__TTVAB_STATE__ = { HasResolvedAdsCountState: true };
		g._S = { adsBlocked: 1500 };
		T<() => void>("_showDonation")();
		vi.advanceTimersByTime(5000);
		const toast = document.getElementById("ttvab-reminder");
		expect(toast?.lang).toBe("ru");
		expect(toast?.querySelector(".title")?.textContent).toBe(
			"Нравится Twitch без рекламы?",
		);
		expect(toast?.querySelector(".sub")?.textContent).toContain(
			(1500).toLocaleString("ru"),
		);
		expect(toast?.querySelector(".sub")?.textContent).toContain("сентября");
	});
});
