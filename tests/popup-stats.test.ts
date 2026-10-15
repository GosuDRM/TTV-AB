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
const DAY_MS = 24 * 60 * 60 * 1000;

type StorageChanges = Record<
	string,
	{ newValue?: unknown; oldValue?: unknown }
>;

let storageData: Record<string, unknown> = {};
let storageListeners: Array<(changes: StorageChanges, area: string) => void> =
	[];
let runtimeMessages: unknown[] = [];
let runtimeResponse: unknown = { ok: true };

function dateKey(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function loadScript(path: string, globalName: string | null = null) {
	let source = readFileSync(resolve(__dirname, path), "utf8").replace(
		/^"use strict";\s*/m,
		"",
	);
	if (globalName) {
		source = source.replace(
			new RegExp(`^const ${globalName}\\s*=`, "m"),
			`globalThis.${globalName} =`,
		);
	}
	new Function("globalThis", source)(globalThis);
}

function mountPopup() {
	const html = readFileSync(
		resolve(__dirname, "../src/popup/popup.html"),
		"utf8",
	);
	const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] || "";
	document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
	document.dispatchEvent(new Event("DOMContentLoaded"));
}

async function settle() {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
	}
}

function element<T extends HTMLElement = HTMLElement>(id: string) {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Missing #${id}`);
	return found as T;
}

beforeAll(() => {
	loadScript("../dist/src/popup/translations.js", "TRANSLATIONS");
	loadScript("../dist/src/popup/popup.js");
});

beforeEach(() => {
	storageListeners = [];
	runtimeMessages = [];
	runtimeResponse = { ok: true };
	localStorage.clear();
	localStorage.setItem("ttvab_lang", "en");
	vi.spyOn(window, "fetch").mockResolvedValue(
		new Response("{}", { status: 503 }),
	);
	window.matchMedia = ((query: string) => ({
		matches: query.includes("prefers-reduced-motion"),
		media: query,
		addEventListener() {},
		removeEventListener() {},
	})) as unknown as typeof window.matchMedia;
	g.chrome = {
		runtime: {
			lastError: null,
			getManifest: () => ({ version: "23.0.1" }),
			getURL: (path: string) => `moz-extension://ttv-ab/${path}`,
			sendMessage: (message: unknown, callback: (value: unknown) => void) => {
				runtimeMessages.push(message);
				callback(runtimeResponse);
			},
		},
		storage: {
			local: {
				get: (
					keys: string[],
					callback: (value: Record<string, unknown>) => void,
				) => {
					const result: Record<string, unknown> = {};
					for (const key of keys) {
						if (key in storageData)
							result[key] = structuredClone(storageData[key]);
					}
					callback(result);
				},
				set: (value: Record<string, unknown>, callback?: () => void) => {
					Object.assign(storageData, value);
					callback?.();
				},
			},
			onChanged: {
				addListener: (
					listener: (changes: StorageChanges, area: string) => void,
				) => {
					storageListeners.push(listener);
				},
			},
		},
		tabs: { create: vi.fn(), query: vi.fn(), sendMessage: vi.fn() },
	};
});

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("popup statistics", () => {
	it("charts the last seven days with per-day history and averages completed days", async () => {
		const now = Date.now();
		storageData = {
			ttvAdsBlocked: 12,
			ttvStats: {
				daily: {
					[dateKey(now)]: {
						ads: 6,
						measuredAds: 20,
						adMilliseconds: 90500,
						watchSeconds: 3900,
					},
					[dateKey(now - 6 * DAY_MS)]: { ads: 6 },
					[dateKey(now - 7 * DAY_MS)]: { ads: 99 },
				},
				channels: {},
				achievements: [],
				adMillisecondsSaved: 90500,
				measuredAds: 20,
			},
		};
		mountPopup();
		await settle();

		const bars = [...element("weeklyChart").querySelectorAll(".chart-bar")];
		expect(bars).toHaveLength(7);
		const todayTitle = bars[6].getAttribute("title") || "";
		expect(todayTitle.split("\n").slice(1)).toEqual([
			"Ad breaks: 6",
			"Ads: 20",
			"Time Saved: 1m 30s",
			"Watch time: 1h 5m",
		]);
		expect(bars[0].getAttribute("title")).toContain("Ad breaks: 6");
		expect(element("chartAvg").textContent).toBe("avg: 1/day");
		expect(element("timeSaved").textContent).toBe("1m 30s");
		expect(document.querySelector('[data-i18n="last7Days"]')?.textContent).toBe(
			"Last 7 Days",
		);
	});

	it("shows real ads and ad breaks separately in the channel modal", async () => {
		storageData = {
			ttvAdsBlocked: 9,
			ttvStats: {
				daily: {},
				channels: {
					somestreamer: { ads: 9, measuredAds: 31, watchSeconds: 60 },
				},
				achievements: [],
				adMillisecondsSaved: 0,
			},
		};
		mountPopup();
		await settle();

		element("channelList").querySelector<HTMLElement>(".channel-item")?.click();
		expect(element("channelModalAds").textContent).toBe("31");
		expect(element("channelModalBreaks").textContent).toBe("9");
	});

	it("exports normalized statistics as a JSON download", async () => {
		storageData = {
			ttvAdsBlocked: 3,
			ttvStats: {
				daily: {},
				channels: { somestreamer: { ads: 3, measuredAds: 7 } },
				achievements: ["first_block", "time_10h"],
				adMillisecondsSaved: 45000,
				measuredAds: 7,
			},
		};
		const downloads: Array<{ href: string; download: string }> = [];
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
			this: HTMLAnchorElement,
		) {
			downloads.push({ href: this.href, download: this.download });
		});
		mountPopup();
		await settle();

		element("statsExportButton").click();
		expect(downloads).toHaveLength(1);
		expect(downloads[0].download).toMatch(
			/^ttv-ab-statistics-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
		);
		const prefix = "data:application/json;charset=utf-8,";
		expect(downloads[0].href.startsWith(prefix)).toBe(true);
		const exported = JSON.parse(
			decodeURIComponent(downloads[0].href.slice(prefix.length)),
		);
		expect(exported).toMatchObject({
			version: "23.0.1",
			ttvAdsBlocked: 3,
			ttvStats: {
				achievements: ["first_block"],
				adMillisecondsSaved: 45000,
				measuredAds: 7,
				channels: { somestreamer: { ads: 3, measuredAds: 7 } },
			},
		});
		expect(document.querySelector("a[download]")).toBeNull();
	});

	it("resets statistics through the background only after confirmation", async () => {
		storageData = { ttvAdsBlocked: 5, ttvStats: {} };
		mountPopup();
		await settle();

		element("statsResetButton").click();
		expect(element("resetStatsOverlay").hidden).toBe(false);
		element("resetStatsCancel").click();
		expect(element("resetStatsOverlay").hidden).toBe(true);
		expect(runtimeMessages).toEqual([]);

		runtimeResponse = { ok: false, error: "Counter persistence busy" };
		vi.spyOn(console, "error").mockImplementation(() => {});
		element("statsResetButton").click();
		element<HTMLButtonElement>("resetStatsConfirm").click();
		expect(runtimeMessages).toEqual([{ type: "ttvab-reset-statistics" }]);
		expect(element("resetStatsOverlay").hidden).toBe(false);
		expect(element("resetStatsText").textContent).toBe(
			"Could not reset statistics. Try again.",
		);

		runtimeResponse = { ok: true };
		element<HTMLButtonElement>("resetStatsConfirm").click();
		expect(runtimeMessages).toHaveLength(2);
		expect(element("resetStatsOverlay").hidden).toBe(true);
		expect(storageData.ttvAdsBlocked).toBe(5);
	});

	it("hides the reset dialog and blocks statistics actions in Turbo mode", async () => {
		storageData = { ttvAdsBlocked: 5, ttvStats: {}, ttvTurboMode: true };
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		mountPopup();
		await settle();

		element("statsResetButton").click();
		element("statsExportButton").click();
		expect(element("resetStatsOverlay").hidden).toBe(true);
		expect(click).not.toHaveBeenCalled();
	});
});
