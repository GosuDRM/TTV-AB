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

function loadPopup() {
	const js = readFileSync(
		resolve(__dirname, "../dist/src/popup/popup.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+)\s*=/gm, "globalThis.$1 =")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

function T<T>(name: string): T {
	const value = g[name];
	if (typeof value !== "function") throw new Error(`${name} not loaded`);
	return value as T;
}

beforeAll(() => {
	g.chrome = {
		runtime: {
			lastError: null,
			getManifest: () => ({ version: "16.0.3" }),
		},
		tabs: {
			query: () => {},
			sendMessage: () => {},
		},
	};
	loadPopup();
});

beforeEach(() => {
	const chromeState = g.chrome as Record<string, Record<string, unknown>>;
	chromeState.runtime.lastError = null;
	chromeState.tabs.query = () => {};
	chromeState.tabs.sendMessage = () => {};
	g._LOG_EXPORT_MAX_CHARACTERS = 2 * 1024 * 1024;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("popup log formatting", () => {
	it("formats malformed timestamps and multiline worker ownership safely", () => {
		const format = T<(entry: Record<string, unknown>) => string>(
			"_formatLogEntryLine",
		);

		const line = format({
			t: Number.MAX_VALUE,
			l: "UNTRUSTED",
			m: "first\nsecond\u0000",
			w: true,
			g: 7.9,
			k: "live:some_channel",
		});

		expect(line).toContain("????-??-??T??:??:??.???Z");
		expect(line).toContain("[worker#g7:info] media=live:some_channel first");
		expect(line).toContain("[worker#g7:info] media=live:some_channel | second");
		expect(line).not.toContain("\u0000");
		expect(
			T<(value: unknown) => string>("_formatLogExportTimestamp")(Symbol()),
		).toBe("????-??-??T??:??:??.???Z");
		for (const timestamp of [0, -1, Number.MAX_VALUE]) {
			expect(
				T<(value: unknown) => string>("_formatLogExportTimestamp")(timestamp),
			).toBe("????-??-??T??:??:??.???Z");
		}
		expect(() =>
			format({ t: 1, l: "info", m: "safe", w: true, g: Symbol() }),
		).not.toThrow();
	});

	it("removes credentials, query strings, and fragments from tab headings", () => {
		const sanitize = T<(value: unknown) => string>("_sanitizeLogExportTabUrl");

		expect(
			sanitize("https://user:pass@www.twitch.tv/channel?token=secret#chat"),
		).toBe("https://www.twitch.tv/channel");
		expect(sanitize("javascript:alert(1)")).toBe("https://www.twitch.tv/");
		expect(
			sanitize(`https://www.twitch.tv/${"x".repeat(5000)}?token=secret`),
		).toHaveLength(2048);
	});

	it("writes explicit collection failures and hard-bounds each tab section", () => {
		const build = T<
			(
				tab: Record<string, unknown>,
				index: number,
				result: Record<string, unknown>,
				maxCharacters: number,
			) => { text: string; truncated: boolean }
		>("_buildTabLogSection");

		const failed = build(
			{ url: "https://www.twitch.tv/channel?token=secret" },
			0,
			{
				entries: [],
				context: null,
				error: "page-response-timeout",
				truncatedEntries: 0,
			},
			1000,
		);
		expect(failed.text).toContain("page log response timed out");
		expect(failed.text).not.toContain("token=secret");

		const bounded = build(
			{ url: "https://www.twitch.tv/channel" },
			0,
			{
				entries: [{ t: 1, l: "info", m: "x".repeat(4000) }],
				context: null,
				error: null,
				truncatedEntries: 0,
			},
			200,
		);
		expect(bounded.truncated).toBe(true);
		expect(bounded.text.length).toBeLessThanOrEqual(200);
		expect(bounded.text).toContain("truncated");

		const missingContext = build(
			{ url: "https://www.twitch.tv/channel" },
			0,
			{
				entries: [],
				context: null,
				error: null,
				truncatedEntries: 0,
			},
			1000,
		);
		expect(missingContext.text).toContain("page state snapshot unavailable");
	});
});

describe("popup log collection lifecycle", () => {
	it("settles a tab query that never calls back", async () => {
		vi.useFakeTimers();
		(g.chrome as Record<string, Record<string, unknown>>).tabs.query = vi.fn();
		const query =
			T<
				(
					timeoutMs: number,
				) => Promise<{ tabs: unknown[]; error: string | null }>
			>("_queryTwitchTabs");

		const resultPromise = query(25);
		await vi.advanceTimersByTimeAsync(25);

		await expect(resultPromise).resolves.toEqual({
			tabs: [],
			error: "tab-query-timeout",
		});
	});

	it("distinguishes an unavailable content script from an empty page log", async () => {
		(g.chrome as Record<string, Record<string, unknown>>).tabs.sendMessage =
			vi.fn((_tabId, _message, _options, callback) => {
				(
					g.chrome as Record<string, Record<string, unknown>>
				).runtime.lastError = {
					message: "no receiver",
				};
				callback(undefined);
			});
		const collect = T<
			(tabId: number, timeoutMs: number) => Promise<Record<string, unknown>>
		>("_collectTabLogEntries");

		await expect(collect(1, 50)).resolves.toEqual({
			entries: [],
			context: null,
			error: "content-script-unavailable",
			truncatedEntries: 0,
		});
	});

	it("settles a tab collection that never responds", async () => {
		vi.useFakeTimers();
		(g.chrome as Record<string, Record<string, unknown>>).tabs.sendMessage =
			vi.fn();
		const collect = T<
			(tabId: number, timeoutMs: number) => Promise<Record<string, unknown>>
		>("_collectTabLogEntries");

		const resultPromise = collect(1, 25);
		await vi.advanceTimersByTimeAsync(25);

		await expect(resultPromise).resolves.toEqual({
			entries: [],
			context: null,
			error: "extension-response-timeout",
			truncatedEntries: 0,
		});
	});

	it("reports a malformed bridge response instead of calling it empty", async () => {
		(g.chrome as Record<string, Record<string, unknown>>).tabs.sendMessage =
			vi.fn((_tabId, _message, _options, callback) => callback(undefined));
		const collect = T<
			(tabId: number, timeoutMs: number) => Promise<Record<string, unknown>>
		>("_collectTabLogEntries");

		await expect(collect(1, 50)).resolves.toEqual({
			entries: [],
			context: null,
			error: "collection-failed",
			truncatedEntries: 0,
		});
	});

	it("prioritizes active and recently accessed tabs within the cap", () => {
		const select = T<
			(
				tabs: Array<Record<string, unknown>>,
				max: number,
			) => {
				tabs: Array<Record<string, unknown>>;
				omittedTabs: number;
			}
		>("_selectLogExportTabs");

		const result = select(
			[
				{ id: 1, active: false, lastAccessed: 30 },
				{ id: 2, active: true, lastAccessed: 10 },
				{ id: 3, active: false, lastAccessed: 50 },
				{ active: true },
			],
			2,
		);

		expect(result.tabs.map((tab) => tab.id)).toEqual([2, 3]);
		expect(result.omittedTabs).toBe(1);
	});

	it("collects at most four of the newest sixteen tabs concurrently", async () => {
		vi.useFakeTimers();
		const chromeState = g.chrome as Record<string, Record<string, unknown>>;
		const tabs = Array.from({ length: 20 }, (_, index) => ({
			id: index + 1,
			url: `https://www.twitch.tv/channel_${index + 1}`,
			active: index === 19,
			lastAccessed: index,
		}));
		chromeState.tabs.query = vi.fn((_query, callback) => callback(tabs));
		let activeRequests = 0;
		let maximumActiveRequests = 0;
		chromeState.tabs.sendMessage = vi.fn(
			(_tabId, _message, _options, callback) => {
				activeRequests += 1;
				maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
				setTimeout(() => {
					activeRequests -= 1;
					callback({
						ok: true,
						entries: [],
						context: null,
						truncatedEntries: 0,
					});
				}, 5);
			},
		);
		const build = T<() => Promise<string>>("_buildLogExport");

		const exportPromise = build();
		await vi.runAllTimersAsync();
		const output = await exportPromise;

		expect(maximumActiveRequests).toBe(4);
		expect(chromeState.tabs.sendMessage).toHaveBeenCalledTimes(16);
		expect(output).toContain(
			"4 older Twitch tabs were omitted to keep the export bounded.",
		);
		expect(output).toContain("channel_20");
		expect(output).not.toContain("/channel_1 ====");
	});

	it("stops scheduling batches when the export is cancelled", async () => {
		vi.useFakeTimers();
		const chromeState = g.chrome as Record<string, Record<string, unknown>>;
		const tabs = Array.from({ length: 16 }, (_, index) => ({
			id: index + 1,
			url: `https://www.twitch.tv/channel_${index + 1}`,
		}));
		chromeState.tabs.query = vi.fn((_query, callback) => callback(tabs));
		let completed = 0;
		let cancelled = false;
		chromeState.tabs.sendMessage = vi.fn(
			(_tabId, _message, _options, callback) => {
				setTimeout(() => {
					completed += 1;
					if (completed === 4) cancelled = true;
					callback({
						ok: true,
						entries: [],
						context: null,
						truncatedEntries: 0,
					});
				}, 5);
			},
		);
		const build =
			T<(isCancelled: () => boolean) => Promise<string>>("_buildLogExport");

		const exportPromise = build(() => cancelled);
		await vi.runAllTimersAsync();
		await exportPromise;

		expect(chromeState.tabs.sendMessage).toHaveBeenCalledTimes(4);
	});

	it("hard-bounds the complete export", async () => {
		const chromeState = g.chrome as Record<string, Record<string, unknown>>;
		g._LOG_EXPORT_MAX_CHARACTERS = 600;
		chromeState.tabs.query = vi.fn((_query, callback) =>
			callback([
				{ id: 1, url: "https://www.twitch.tv/first" },
				{ id: 2, url: "https://www.twitch.tv/second" },
			]),
		);
		chromeState.tabs.sendMessage = vi.fn(
			(_tabId, _message, _options, callback) =>
				callback({
					ok: true,
					entries: [{ t: 1, l: "info", m: "x".repeat(4000) }],
					context: null,
					truncatedEntries: 0,
				}),
		);

		const output = await T<() => Promise<string>>("_buildLogExport")();

		expect(output.length).toBeLessThanOrEqual(600);
		expect(output).toContain("truncated");
	});

	it("revokes the object URL immediately when download initiation fails", () => {
		const createObjectURL = vi.fn(() => "blob:test");
		const revokeObjectURL = vi.fn();
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: createObjectURL,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: revokeObjectURL,
		});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
			throw new Error("download blocked");
		});
		const download = T<(text: string) => boolean>("_downloadLogExport");

		expect(() => download("test")).toThrow("download blocked");
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
	});
});
