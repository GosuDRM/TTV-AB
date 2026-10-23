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
	storageData = {};
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

describe("popup language", () => {
	const selector = () => element<HTMLSelectElement>("langSelector");

	it("copies an older popup-only choice into shared extension storage", async () => {
		localStorage.setItem("ttvab_lang", "es");
		mountPopup();
		await settle();

		expect(storageData.ttvLanguage).toBe("es");
		expect(selector().value).toBe("es");
	});

	it("prefers the shared choice over the popup's copy", async () => {
		storageData = { ttvLanguage: "de" };
		mountPopup();
		await settle();

		expect(selector().value).toBe("de");
		expect(document.documentElement.lang).toBe("de");
		expect(localStorage.getItem("ttvab_lang")).toBe("de");
	});

	it("saves a new choice for Twitch pages and follows changes from other tabs", async () => {
		mountPopup();
		await settle();
		selector().value = "ja";
		selector().dispatchEvent(new Event("change"));
		expect(storageData.ttvLanguage).toBe("ja");

		for (const listener of storageListeners)
			listener({ ttvLanguage: { oldValue: "ja", newValue: "ru" } }, "local");
		expect(selector().value).toBe("ru");
		expect(document.documentElement.lang).toBe("ru");
		expect(document.querySelector('[data-i18n="last7Days"]')?.textContent).toBe(
			(g.TRANSLATIONS as Record<string, { last7Days: string }>).ru.last7Days,
		);
	});

	it("follows a language change in the open log export tab", async () => {
		window.history.replaceState(null, "", "/?ttvab-log-export=1");
		try {
			mountPopup();
			await settle();
			for (const listener of storageListeners)
				listener({ ttvLanguage: { oldValue: "en", newValue: "it" } }, "local");
			expect(document.documentElement.lang).toBe("it");
		} finally {
			window.history.replaceState(null, "", "/");
		}
	});

	it("names the language Auto picked", async () => {
		localStorage.setItem("ttvab_lang", "auto");
		vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP"]);
		mountPopup();
		await settle();

		expect(element("langAutoOption").textContent).toBe("🌐 自動 (日本語)");
		expect(document.documentElement.lang).toBe("ja");
	});

	it.each([
		["zh-Hans-HK", "zh-CN"],
		["zh-HK", "zh-TW"],
		["pt-PT", "pt"],
	])("matches the browser language %s", async (browserLanguage, htmlLang) => {
		localStorage.setItem("ttvab_lang", "auto");
		vi.spyOn(navigator, "languages", "get").mockReturnValue([browserLanguage]);
		mountPopup();
		await settle();

		expect(document.documentElement.lang).toBe(htmlLang);
	});

	it.each(["constructor", "__proto__", "toString"])(
		"resets the stored value %s to Auto",
		async (stored) => {
			localStorage.setItem("ttvab_lang", stored);
			mountPopup();
			await settle();

			expect(selector().value).toBe("auto");
			expect(localStorage.getItem("ttvab_lang")).toBe("auto");
		},
	);

	it("labels each language option with its flag and its own language", () => {
		mountPopup();
		const options = [...selector().options].filter(
			(option) => option.value !== "auto",
		);
		expect(options.every((option) => option.lang)).toBe(true);
		expect(
			options.every((option) =>
				/^[\u{1F1E6}-\u{1F1FF}]{2} \S/u.test(option.text),
			),
		).toBe(true);
	});
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

	it.each([
		[86399999, "23h 59m 59s"],
		[86400000, "1d 0h 0m 0s"],
		[911045000, "10d 13h 4m 5s"],
	])("shows Time Saved of %i ms as %s", async (milliseconds, expected) => {
		storageData = {
			ttvAdsBlocked: 1,
			ttvStats: {
				daily: {},
				channels: {},
				achievements: [],
				adMillisecondsSaved: milliseconds,
				measuredAds: 1,
			},
		};
		mountPopup();
		await settle();

		expect(element("timeSaved").textContent).toBe(expected);
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

	it("formats durations and the channel share in the chosen language", async () => {
		localStorage.setItem("ttvab_lang", "fr");
		storageData = {
			ttvLanguage: "fr",
			ttvAdsBlocked: 9,
			ttvStats: {
				daily: {},
				channels: { somestreamer: { ads: 4, watchSeconds: 60 } },
				achievements: [],
				adMillisecondsSaved: 90500,
				measuredAds: 1,
			},
		};
		mountPopup();
		await settle();

		const unit = (value: number, name: string) =>
			new Intl.NumberFormat("fr", {
				style: "unit",
				unit: name,
				unitDisplay: "narrow",
			}).format(value);
		expect(element("timeSaved").textContent).toBe(
			`${unit(1, "minute")} ${unit(30, "second")}`,
		);
		expect(element("timeSaved").textContent).not.toBe("1m 30s");
		element("channelList").querySelector<HTMLElement>(".channel-item")?.click();
		expect(element("channelModalSharePct").textContent).toBe(
			new Intl.NumberFormat("fr", { style: "percent" }).format(0.44),
		);
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

	function statsWithChannels(channels: Record<string, unknown>) {
		return {
			ttvAdsBlocked: 10,
			ttvStats: {
				daily: {},
				channels,
				achievements: [],
				adMillisecondsSaved: 0,
			},
		};
	}

	function updateStatistics(next: Record<string, unknown>) {
		Object.assign(storageData, next);
		for (const listener of storageListeners) {
			listener(
				{
					ttvStats: { newValue: next.ttvStats },
					ttvAdsBlocked: { newValue: next.ttvAdsBlocked },
				},
				"local",
			);
		}
	}

	it("updates open channel details in place instead of replaying the animation", async () => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener() {},
			removeEventListener() {},
		})) as unknown as typeof window.matchMedia;
		storageData = statsWithChannels({ somestreamer: { ads: 4 } });
		mountPopup();
		await settle();
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);

		element("channelList").querySelector<HTMLElement>(".channel-item")?.click();
		expect(element("channelModalShareBar").style.width).toBe("0%");
		updateStatistics(statsWithChannels({ somestreamer: { ads: 5 } }));

		expect(element("channelModalBreaks").textContent).toBe("5");
		expect(element("channelModalShareBar").style.width).toBe("50%");
	});

	it("keeps keyboard focus and chart bars across statistic updates", async () => {
		storageData = statsWithChannels({
			firststreamer: { ads: 6 },
			secondstreamer: { ads: 4 },
		});
		mountPopup();
		await settle();
		element("statsToggle").click();
		const firstBar = element("weeklyChart").children[0];
		element("channelList")
			.querySelector<HTMLElement>('[data-channel="secondstreamer"]')
			?.focus();

		updateStatistics(
			statsWithChannels({
				firststreamer: { ads: 6 },
				secondstreamer: { ads: 5 },
			}),
		);

		expect((document.activeElement as HTMLElement).dataset.channel).toBe(
			"secondstreamer",
		);
		expect(element("weeklyChart").children[0]).toBe(firstBar);
	});

	it("keeps the reset dialog open until the background answers", async () => {
		storageData = { ttvAdsBlocked: 5, ttvStats: {} };
		let answer: ((response: unknown) => void) | null = null;
		(g.chrome as { runtime: { sendMessage: unknown } }).runtime.sendMessage = (
			_message: unknown,
			callback: (response: unknown) => void,
		) => {
			answer = callback;
		};
		vi.spyOn(console, "error").mockImplementation(() => {});
		mountPopup();
		await settle();

		element("statsResetButton").click();
		element<HTMLButtonElement>("resetStatsConfirm").click();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		element("resetStatsOverlay").click();
		expect(element("resetStatsOverlay").hidden).toBe(false);
		expect(element<HTMLButtonElement>("resetStatsCancel").disabled).toBe(true);

		answer?.({ ok: false, error: "busy" });
		expect(element("resetStatsOverlay").hidden).toBe(false);
		expect(element("resetStatsText").textContent).toBe(
			"Could not reset statistics. Try again.",
		);
		expect(element<HTMLButtonElement>("resetStatsCancel").disabled).toBe(false);
	});

	it("shows a statistics export failure on the button", async () => {
		storageData = { ttvAdsBlocked: 1, ttvStats: {} };
		mountPopup();
		await settle();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.useFakeTimers();
		const runtime = (
			g.chrome as { runtime: { lastError: { message: string } | null } }
		).runtime;
		const storage = (
			g.chrome as {
				storage: { local: { get: (keys: string[], cb: () => void) => void } };
			}
		).storage.local;
		storage.get = (_keys, callback) => {
			runtime.lastError = { message: "storage unavailable" };
			try {
				callback();
			} finally {
				runtime.lastError = null;
			}
		};

		try {
			element("statsExportButton").click();
			expect(element("statsExportButton").textContent).toBe("Export failed");
			vi.advanceTimersByTime(3000);
			expect(element("statsExportButton").textContent).toBe("Export");
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps Tab focus inside the reset dialog", async () => {
		storageData = { ttvAdsBlocked: 5, ttvStats: {} };
		mountPopup();
		await settle();
		element("statsToggle").click();
		element("statsResetButton").click();
		expect(document.activeElement).toBe(element("resetStatsCancel"));

		element("resetStatsCancel").dispatchEvent(
			new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
		);
		expect(document.activeElement).toBe(element("resetStatsClose"));
		element("resetStatsClose").dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Tab",
				shiftKey: true,
				bubbles: true,
			}),
		);
		expect(document.activeElement).toBe(element("resetStatsCancel"));
	});

	it("keeps both channel avatars when two lookups finish together", async () => {
		storageData = statsWithChannels({
			firststreamer: { ads: 6 },
			secondstreamer: { ads: 4 },
		});
		vi.spyOn(window, "fetch").mockImplementation(async (_url, init) => {
			const login = JSON.parse(String(init?.body)).variables.login;
			return new Response(
				JSON.stringify({
					data: {
						user: {
							profileImageURL: `https://static-cdn.jtvnw.net/${login}.png`,
						},
					},
				}),
			);
		});
		mountPopup();
		await settle();

		for (const channel of ["firststreamer", "secondstreamer"]) {
			element("channelList")
				.querySelector<HTMLElement>(`[data-channel="${channel}"]`)
				?.click();
		}
		await settle();

		expect(Object.keys(storageData.ttvChannelAvatars as object).sort()).toEqual(
			["firststreamer", "secondstreamer"],
		);
	});
});

describe("bug report flow", () => {
	afterEach(() => {
		window.history.replaceState(null, "", "/");
	});

	it("opens a new GitHub issue prefilled with the environment", async () => {
		mountPopup();
		await settle();

		element("reportBugLink").click();
		element("logDialogSkip").click();

		const create = (g.chrome as { tabs: { create: ReturnType<typeof vi.fn> } })
			.tabs.create;
		expect(create).toHaveBeenCalledTimes(1);
		const url = new URL(create.mock.calls[0][0].url);
		expect(url.origin + url.pathname).toBe(
			"https://github.com/GosuDRM/TTV-AB/issues/new",
		);
		expect(url.searchParams.get("template")).toBe("bug_report.yml");
		expect(url.searchParams.get("version")).toBe("23.0.1");
	});

	it("says a fallback download started and offers to save again", async () => {
		window.history.replaceState(null, "", "/?ttvab-log-export=1");
		(g.chrome as { tabs: { query: unknown } }).tabs.query = vi.fn(
			(_query, callback: (tabs: unknown[]) => void) => callback([]),
		);
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		mountPopup();
		await settle();
		expect(element("logDialogTitle").textContent).toBe("Debug log ready");

		element("logDialogGenerate").click();
		await settle();

		expect(click).toHaveBeenCalledTimes(1);
		expect(element("logDialogTitle").textContent).toBe("Debug log downloaded");
		expect(element("logDialogText").textContent).toContain("Downloads folder");
		expect(element("logDialogGenerate").hidden).toBe(false);
		expect(element("logDialogGenerate").textContent).toBe("Save again");

		element("logDialogGenerate").click();
		await settle();
		expect(click).toHaveBeenCalledTimes(2);
	});

	it("ignores Escape on the log export page", async () => {
		window.history.replaceState(null, "", "/?ttvab-log-export=1");
		(g.chrome as { tabs: { query: unknown } }).tabs.query = vi.fn(
			(_query, callback: (tabs: unknown[]) => void) => callback([]),
		);
		mountPopup();
		await settle();

		expect(() =>
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
		).not.toThrow();
		expect(element("logDialogOverlay").hidden).toBe(false);
	});

	it("shows log export failures in the chosen language", async () => {
		window.history.replaceState(null, "", "/?ttvab-log-export=1");
		localStorage.setItem("ttvab_lang", "es");
		(g.chrome as { runtime: { getManifest: unknown } }).runtime.getManifest =
			() => {
				throw new Error("boom");
			};
		mountPopup();
		await settle();

		expect(element("logDialogText").textContent).toBe(
			"No se pudo exportar el registro: boom",
		);
	});
});
