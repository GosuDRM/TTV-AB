import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const windows: Window[] = [];
const content = readFileSync(
	resolve(__dirname, "../dist/src/scripts/content.js"),
	"utf8",
);
const cleanMedia = readFileSync(
	resolve(__dirname, "fixtures/twitch-clean-media.m3u8"),
	"utf8",
);
const masterUrl = "https://usher.ttvnw.net/api/channel/hls/buildtest.m3u8";
const mediaUrl =
	"https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8";
const originalWorkerUrl =
	"https://static.twitchcdn.net/assets/player-worker.js";

afterEach(async () => {
	await Promise.all(windows.splice(0).map((page) => page.happyDOM.close()));
});

function loadBuiltPage() {
	const page = new Window({
		url: "https://www.twitch.tv/buildtest",
		settings: {
			enableJavaScriptEvaluation: true,
			suppressInsecureJavaScriptEnvironmentWarning: true,
		},
	});
	windows.push(page);
	const sources = new Map<string, string>();
	let nextBlob = 0;
	class TestBlob {
		source: string;

		constructor(parts: unknown[]) {
			this.source = parts.map(String).join("");
		}
	}
	class TestURL extends page.URL {
		static createObjectURL(blob: TestBlob) {
			const url = `blob:https://www.twitch.tv/built-worker-${++nextBlob}`;
			sources.set(url, blob.source);
			return url;
		}

		static revokeObjectURL(url: string) {
			sources.delete(url);
		}
	}
	class TestWorker extends page.EventTarget {
		url: string;
		source: string;
		messages: unknown[] = [];

		constructor(url: string) {
			super();
			this.url = String(url);
			this.source = sources.get(this.url) || "";
		}

		postMessage(message: unknown) {
			this.messages.push(message);
		}

		terminate() {}
	}
	class TestXMLHttpRequest {
		responseText = "";

		open(_method: string, url: string) {
			this.responseText = sources.get(url) || "";
		}

		send() {}
	}
	const rawPageFetch = vi.fn(async () => new Response("page response"));
	Object.assign(page, {
		Worker: TestWorker,
		Blob: TestBlob,
		URL: TestURL,
		XMLHttpRequest: TestXMLHttpRequest,
		fetch: rawPageFetch,
		postMessage: vi.fn(),
		setTimeout: vi.fn(() => 1),
		setInterval: vi.fn(() => 1),
		clearTimeout: vi.fn(),
		clearInterval: vi.fn(),
	});
	page.eval(content);
	return {
		page,
		rawPageFetch,
		state: page.eval("__TTVAB_STATE__") as Record<string, unknown>,
		createBlob: (source: string) =>
			TestURL.createObjectURL(new TestBlob([source])),
		createWorker: (url = originalWorkerUrl) =>
			page.eval(`new Worker(${JSON.stringify(url)})`) as TestWorker,
	};
}

function startBuiltWorker(
	worker: { source: string; messages: unknown[] },
	fetch: typeof globalThis.fetch,
) {
	const listeners: Array<(event: { data: unknown }) => void> = [];
	const scope = {
		URL,
		URLSearchParams,
		Headers,
		Request,
		Response,
		AbortController,
		AbortSignal,
		DOMException,
		TextEncoder,
		TextDecoder,
		atob,
		btoa,
		setTimeout: vi.fn(() => 1),
		setInterval: vi.fn(() => 1),
		clearTimeout: vi.fn(),
		clearInterval: vi.fn(),
		fetch,
		bootFetch: undefined as typeof fetch | undefined,
		console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
		postMessage: vi.fn(),
		importScripts: vi.fn(() => {
			scope.bootFetch = scope.fetch;
		}),
		addEventListener: (
			type: string,
			listener: (event: { data: unknown }) => void,
		) => {
			if (type === "message") listeners.push(listener);
		},
	};
	Object.assign(scope, { self: scope });
	runInContext(worker.source, createContext(scope));
	const context = scope as typeof scope & {
		__TTVAB_STATE__: Record<string, unknown>;
	};
	for (const data of worker.messages) {
		for (const listener of listeners) listener({ data });
	}
	return { scope: context, listeners };
}

describe("shipped content script and worker", () => {
	it("initializes once from the assembled script and keeps worker state separate", () => {
		const { page, state, createWorker } = loadBuiltPage();
		const hookedWorker = page.Worker;
		const hookedFetch = page.fetch;
		page.eval(content);
		expect(page.Worker).toBe(hookedWorker);
		expect(page.fetch).toBe(hookedFetch);
		expect(state.PageMediaKey).toBe("live:buildtest");
		expect(page.happyDOM.virtualConsolePrinter.readAsString()).toContain(
			"Initialized successfully",
		);
		const rawFetch = vi.fn(async () => new Response("worker response"));
		const { scope, listeners } = startBuiltWorker(createWorker(), rawFetch);
		expect(scope.fetch).not.toBe(rawFetch);
		expect(scope.bootFetch).toBe(scope.fetch);
		expect(scope.importScripts).toHaveBeenCalledExactlyOnceWith(
			originalWorkerUrl,
		);
		expect(listeners).toHaveLength(1);
		expect(scope.__TTVAB_STATE__.PageMediaKey).toBe("live:buildtest");
		expect(scope.__TTVAB_STATE__).not.toBe(state);
		expect(scope.postMessage).toHaveBeenCalledWith({
			__ttvabWorkerBridge: true,
			message: { key: "Pong", value: null },
		});
		scope.__TTVAB_STATE__.IsAdStrippingEnabled = false;
		expect(state.IsAdStrippingEnabled).toBe(true);
	});

	it("rejects malformed commands before mutating playback state or settling fetches", () => {
		const { createWorker } = loadBuiltPage();
		const { scope, listeners } = startBuiltWorker(
			createWorker(),
			vi.fn(async () => new Response("worker response")),
		);
		const state = scope.__TTVAB_STATE__;
		state.CurrentAdMediaKey = "live:buildtest";
		state.CurrentAdChannel = "buildtest";
		state.PreferredQualityGroup = "1440p60";
		const resolved = vi.fn();
		const rejected = vi.fn();
		const pending = state.PendingFetchRequests as Map<string, unknown>;
		pending.set("fetch-1", { resolve: resolved, reject: rejected });
		const send = (message: unknown) => {
			for (const listener of listeners) {
				listener({ data: { __ttvabWorkerBridge: true, message } });
			}
		};
		for (const message of [
			{ key: "UpdateToggleState", value: "false" },
			{ key: "UpdatePreferredQualityGroup", value: {} },
			{ key: "UpdatePageContext", value: { mediaKey: {} } },
			{ key: "UpdateCurrentAdContext", value: [] },
			{ key: "FetchResponse", value: { id: "fetch-1", status: "200" } },
		]) {
			send(message);
		}
		expect(state.IsAdStrippingEnabled).toBe(true);
		expect(state.CurrentAdMediaKey).toBe("live:buildtest");
		expect(state.PageMediaKey).toBe("live:buildtest");
		expect(state.PreferredQualityGroup).toBe("1440p60");
		expect(pending.has("fetch-1")).toBe(true);
		expect(resolved).not.toHaveBeenCalled();
		expect(rejected).not.toHaveBeenCalled();
		send({ key: "FetchResponse", value: { id: "fetch-1", body: "response" } });
		expect(pending.has("fetch-1")).toBe(false);
		expect(resolved).toHaveBeenCalledExactlyOnceWith({
			id: "fetch-1",
			body: "response",
		});
		send({ key: "UpdateToggleState", value: false });
		expect(state.IsAdStrippingEnabled).toBe(false);
		expect(state.CurrentAdMediaKey).toBeNull();
	});

	it("rejects malformed events before playback changes, fetches, and heartbeat acknowledgement", async () => {
		const { page, state, createWorker, rawPageFetch } = loadBuiltPage();
		const worker = createWorker();
		const lifecycle = Object.assign(worker, { __TTVABLastPongAt: 0 });
		const emit = (message: unknown) =>
			worker.dispatchEvent(
				new page.MessageEvent("message", {
					data: { __ttvabWorkerBridge: true, message },
				}),
			);
		const cycleStartedAt = Date.now();
		const context = {
			mediaKey: "live:buildtest",
			channel: "buildtest",
			pageMediaKey: "live:buildtest",
			pageContextGeneration: state.PagePlaybackContextGeneration,
			cycleStartedAt,
		};
		const initialMessages = worker.messages.length;
		for (const message of [
			{ key: "Pong", value: true },
			{ key: "AdDetected", continued: "false" },
			{ key: "AdPodProgress", adIds: ["ad-1", {}] },
			{ key: "BackupPlayerTypeSelected", value: { type: "site" } },
			{
				key: "FetchRequest",
				value: {
					id: "fetch-invalid",
					url: "https://gql.twitch.tv/gql",
					options: { body: {} },
				},
			},
		])
			emit({ ...context, ...message });
		expect(lifecycle.__TTVABLastPongAt).toBe(0);
		expect(state.CurrentAdMediaKey).toBeNull();
		expect(state.PinnedBackupPlayerType).toBeNull();
		expect(state.AdPodProgressByMediaKey).toEqual({});
		expect(rawPageFetch).not.toHaveBeenCalled();
		expect(worker.messages).toHaveLength(initialMessages);
		emit({ key: "Pong", value: null });
		expect(lifecycle.__TTVABLastPongAt).toBeGreaterThan(0);
		emit({
			...context,
			key: "AdDetected",
			continued: false,
			detectedAt: cycleStartedAt,
		});
		expect(state.CurrentAdMediaKey).toBe("live:buildtest");
		emit({
			key: "FetchRequest",
			value: {
				id: "fetch-valid",
				url: "https://gql.twitch.tv/gql",
				options: { method: "POST", body: "{}" },
			},
		});
		await vi.waitFor(() =>
			expect(worker.messages).toContainEqual({
				__ttvabWorkerBridge: true,
				message: {
					key: "FetchResponse",
					value: expect.objectContaining({
						id: "fetch-valid",
						status: 200,
						body: "page response",
					}),
				},
			}),
		);
		expect(rawPageFetch).toHaveBeenCalledExactlyOnceWith(
			"https://gql.twitch.tv/gql",
			expect.objectContaining({
				method: "POST",
				body: "{}",
				signal: expect.anything(),
			}),
		);
	});

	it("hooks before blob bootstrap and preserves one hook when its source is copied", () => {
		const { createBlob, createWorker } = loadBuiltPage();
		const originalUrl = createBlob(
			'self.bootFetch = self.fetch; self.postMessage({ key: "OriginalWorkerBooted", mediaKey: __TTVAB_STATE__.PageMediaKey });',
		);
		const worker = createWorker(originalUrl);
		const copiedWorker = createWorker(createBlob(worker.source));
		expect(copiedWorker.source).toBe(worker.source);
		for (const candidate of [worker, copiedWorker]) {
			const rawFetch = vi.fn(async () => new Response("worker response"));
			const { scope, listeners } = startBuiltWorker(candidate, rawFetch);
			expect(scope.bootFetch).toBe(scope.fetch);
			expect(scope.bootFetch).not.toBe(rawFetch);
			expect(scope.importScripts).not.toHaveBeenCalled();
			expect(listeners).toHaveLength(1);
			expect(scope.postMessage).toHaveBeenCalledWith({
				key: "OriginalWorkerBooted",
				mediaKey: "live:buildtest",
			});
		}
	});

	it.each(["avc1.64002a", "hvc1.1.6.L150.B0", "av01.0.12M.10"])(
		"serves clean %s media through the assembled worker without ad events",
		async (codec) => {
			const { createWorker } = loadBuiltPage();
			const master = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440,CODECS="mp4a.40.2,${codec}"\n${mediaUrl}`;
			const rawFetch = vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === masterUrl) return new Response(master);
				if (String(input) === mediaUrl) return new Response(cleanMedia);
				throw new Error(`Unexpected fetch: ${String(input)}`);
			});
			const { scope } = startBuiltWorker(createWorker(), rawFetch);
			expect(await (await scope.fetch(masterUrl)).text()).toContain(codec);
			expect(await (await scope.fetch(mediaUrl)).text()).toBe(cleanMedia);
			expect(rawFetch).toHaveBeenCalledTimes(2);
			expect(scope.__TTVAB_STATE__.CurrentAdMediaKey).toBeNull();
			expect(scope.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.objectContaining({ key: "AdDetected" }),
				}),
			);
		},
	);

	it("blocks known ad segments and preserves disabled pass-through", async () => {
		const { createWorker } = loadBuiltPage();
		const rawFetch = vi.fn(async () => new Response("segment bytes"));
		const { scope } = startBuiltWorker(createWorker(), rawFetch);
		const adUrl = "https://video-edge.example.ttvnw.net/stitched-ad-1.ts";
		await expect(scope.fetch(adUrl)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(rawFetch).not.toHaveBeenCalled();
		scope.__TTVAB_STATE__.IsAdStrippingEnabled = false;
		expect(await (await scope.fetch(adUrl)).text()).toBe("segment bytes");
		expect(rawFetch).toHaveBeenCalledExactlyOnceWith(adUrl);
	});
});
