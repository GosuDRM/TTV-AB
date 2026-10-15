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

describe("donation reminder randomized scheduling", () => {
	beforeEach(() => {
		g._log = () => {};
		localStorage.removeItem(NEXT_KEY);
		localStorage.removeItem(LAST_KEY);
		localStorage.removeItem("ttvab_reminder_cadence");
		delete (window as unknown as Record<string, unknown>).__TTVAB_UI_FLAGS__;
		document.getElementById("ttvab-reminder")?.remove();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.getElementById("ttvab-reminder")?.remove();
	});

	it("draws delays within the 7-14 day window", () => {
		const draw = T<() => number>("_getNextReminderDelayMs");
		for (let i = 0; i < 200; i++) {
			const delay = draw();
			expect(delay).toBeGreaterThanOrEqual(7 * DAY);
			expect(delay).toBeLessThanOrEqual(14 * DAY);
		}
	});

	it("schedules a future randomized slot on first run without showing", () => {
		const now = 1000000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		T<() => void>("_showDonation")();

		const nextAt = Number.parseInt(localStorage.getItem(NEXT_KEY) || "", 10);
		expect(nextAt).toBeGreaterThanOrEqual(now + 7 * DAY);
		expect(nextAt).toBeLessThanOrEqual(now + 14 * DAY);
		expect(document.getElementById("ttvab-reminder")).toBeNull();
		vi.restoreAllMocks();
	});

	it("migrates a legacy last-reminder stamp into a randomized slot", () => {
		const now = 1000000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		localStorage.setItem(LAST_KEY, String(now - 2 * DAY));
		T<() => void>("_showDonation")();

		const nextAt = Number.parseInt(localStorage.getItem(NEXT_KEY) || "", 10);
		expect(nextAt).toBeGreaterThanOrEqual(now + 5 * DAY);
		expect(nextAt).toBeLessThanOrEqual(now + 12 * DAY);
		expect(document.getElementById("ttvab-reminder")).toBeNull();
		vi.restoreAllMocks();
	});

	it("does not show before the scheduled slot", () => {
		const now = 1000000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		localStorage.setItem(NEXT_KEY, String(now + DAY));
		vi.useFakeTimers({ now });
		T<() => void>("_showDonation")();
		vi.advanceTimersByTime(6000);
		expect(document.getElementById("ttvab-reminder")).toBeNull();
	});

	it("shows once the slot is due and reschedules a new randomized slot", () => {
		const now = 1000000000000;
		localStorage.setItem(NEXT_KEY, String(now - 1000));
		vi.useFakeTimers({ now });
		vi.spyOn(Date, "now").mockReturnValue(now);
		T<() => void>("_showDonation")();
		vi.advanceTimersByTime(5100);

		expect(document.getElementById("ttvab-reminder")).not.toBeNull();
		const markImage = document.querySelector("#ttvab-reminder img.mark");
		expect(
			String((markImage as HTMLImageElement | null)?.src || "").startsWith(
				"data:image/png;base64,",
			),
		).toBe(true);
		const nextAt = Number.parseInt(localStorage.getItem(NEXT_KEY) || "", 10);
		expect(nextAt).toBeGreaterThanOrEqual(now + 7 * DAY);
		expect(nextAt).toBeLessThanOrEqual(now + 14 * DAY);
		expect(localStorage.getItem(LAST_KEY)).toBe(String(now));
	});

	it("re-randomizes a corrupted far-future slot instead of never showing", () => {
		const now = 1000000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		localStorage.setItem(NEXT_KEY, String(now + 400 * DAY));
		T<() => void>("_showDonation")();

		const nextAt = Number.parseInt(localStorage.getItem(NEXT_KEY) || "", 10);
		expect(nextAt).toBeGreaterThanOrEqual(now + 7 * DAY);
		expect(nextAt).toBeLessThanOrEqual(now + 14 * DAY);
		expect(document.getElementById("ttvab-reminder")).toBeNull();
		vi.restoreAllMocks();
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
