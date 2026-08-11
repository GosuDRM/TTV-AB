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
const runtimeMessages: Array<Record<string, unknown>> = [];
let runtimeLogListener:
	| ((
			message: unknown,
			sender: { id?: string },
			sendResponse: (response: unknown) => void,
	  ) => unknown)
	| null = null;

function loadBridge() {
	const js = readFileSync(
		resolve(__dirname, "../dist/src/scripts/bridge.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (\w+)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	g.chrome = {
		runtime: {
			id: "ttvab-test",
			lastError: null,
			onMessage: {
				addListener: (listener: typeof runtimeLogListener) => {
					runtimeLogListener = listener;
				},
			},
			sendMessage: (
				message: Record<string, unknown>,
				callback: (response: unknown) => void,
			) => {
				runtimeMessages.push(message);
				callback({ ok: true, newUnlocks: [] });
			},
		},
		storage: {
			local: { get: () => {} },
			onChanged: { addListener: () => {} },
		},
	};
	loadBridge();
});

beforeEach(() => {
	runtimeMessages.length = 0;
	localStorage.clear();
	const pending = g.pendingLogCollections as Map<
		string,
		{ timer: ReturnType<typeof setTimeout> }
	>;
	for (const entry of pending.values()) {
		clearTimeout(entry.timer);
	}
	pending.clear();
	if (g.handshakeRetryTimeout) {
		clearTimeout(g.handshakeRetryTimeout as ReturnType<typeof setTimeout>);
	}
	g.handshakeRetryTimeout = null;
	g.pageBridgePort = null;
	g.pageBridgeConnected = false;
	g.bridgeSessionToken = null;
	g.bridgeStateReady = false;
	g.handshakeRetryCount = 0;
	g.logCollectionSequence = 0;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function handlePageMessage(message: Record<string, unknown>) {
	return (
		g.handlePageBridgeMessage as (value: Record<string, unknown>) => unknown
	)(message);
}

function requestRuntimeLogs(sendResponse: (response: unknown) => void) {
	if (!runtimeLogListener)
		throw new Error("runtime listener was not installed");
	return runtimeLogListener(
		{ type: "ttvab-collect-logs" },
		{ id: "ttvab-test" },
		sendResponse,
	);
}

function makePagePort(shouldThrow = false) {
	const messages: Array<Record<string, unknown>> = [];
	let messageListener: ((event: { data: unknown }) => void) | null = null;
	return {
		messages,
		postMessage: vi.fn((message: Record<string, unknown>) => {
			if (shouldThrow) throw new Error("port closed");
			messages.push(message);
		}),
		addEventListener: vi.fn(
			(eventName: string, listener: (event: { data: unknown }) => void) => {
				if (eventName === "message") messageListener = listener;
			},
		),
		emitMessage(data: unknown) {
			messageListener?.({ data });
		},
		start: vi.fn(),
		close: vi.fn(),
	};
}

function makeExitFlush() {
	return {
		flushId: "flush:test:page-exit-0001",
		createdAt: Date.now(),
		adsDelta: 0,
		channelDeltas: {},
		watchDeltas: { somestreamer: 7 },
	};
}

describe("page-exit counter journal lifecycle", () => {
	it("dispatches the exact journaled watch delta and confirms only after clearing it", () => {
		const flush = makeExitFlush();
		const storageKey = `ttvab_pending_counter_flush:${flush.flushId}`;
		localStorage.setItem(storageKey, JSON.stringify(flush));

		handlePageMessage({
			type: "ttvab-persist-counter-flush",
			detail: flush,
		});

		expect(runtimeMessages).toEqual([
			{
				type: "ttvab-persist-counters",
				detail: expect.objectContaining({
					flushId: flush.flushId,
					watchDeltas: { somestreamer: 7 },
				}),
			},
			{
				type: "ttvab-confirm-counter-flush",
				detail: { flushId: flush.flushId },
			},
		]);
		expect(localStorage.getItem(storageKey)).toBeNull();
	});

	it("leaves the flush unconfirmed when its journal cannot be removed", () => {
		const flush = makeExitFlush();
		const storageKey = `ttvab_pending_counter_flush:${flush.flushId}`;
		localStorage.setItem(storageKey, JSON.stringify(flush));
		const removeItem = vi
			.spyOn(localStorage, "removeItem")
			.mockImplementation(() => {
				throw new Error("storage unavailable");
			});

		handlePageMessage({
			type: "ttvab-persist-counter-flush",
			detail: flush,
		});

		expect(runtimeMessages).toHaveLength(1);
		expect(runtimeMessages[0]?.type).toBe("ttvab-persist-counters");
		expect(localStorage.getItem(storageKey)).not.toBeNull();
		removeItem.mockRestore();
	});
});

describe("log export sanitization", () => {
	it("normalizes fields and removes control characters and secrets", () => {
		const sanitize = g.sanitizeLogEntries as (value: unknown) => {
			entries: Array<Record<string, unknown>>;
			truncatedEntries: number;
		};
		const result = sanitize([
			null,
			{
				t: 8640000000000001,
				l: "unknown",
				m: "Authorization: Bearer secret-token\nhttps://example.com/live.m3u8?token=secret#fragment\u0000done",
				w: false,
				g: 99,
				k: "live:ignored",
			},
			{
				t: 1234,
				l: "ERROR",
				m: "Client-Integrity=private-value",
				w: true,
				g: 7.9,
				k: "LIVE:Some_Streamer",
			},
		]);

		expect(result.truncatedEntries).toBe(1);
		expect(result.entries).toEqual([
			{
				t: 0,
				l: "info",
				m: expect.any(String),
				w: false,
			},
			{
				t: 1234,
				l: "error",
				m: "Client-Integrity=[redacted]",
				w: true,
				g: 7,
				k: "live:some_streamer",
			},
		]);
		const firstMessage = String(result.entries[0]?.m);
		expect(
			Array.from(firstMessage).every((character) => {
				const code = character.charCodeAt(0);
				return code > 31 && code !== 127;
			}),
		).toBe(true);
		expect(firstMessage).not.toContain("secret-token");
		expect(firstMessage).not.toContain("token=secret");
		expect(firstMessage).toContain("https://example.com/live.m3u8?[redacted]");
		expect(result.entries[0]).not.toHaveProperty("g");
		expect(result.entries[0]).not.toHaveProperty("k");
	});

	it("removes URL credentials even when a URL has no query or fragment", () => {
		const sanitize = g.sanitizeLogEntries as (value: unknown) => {
			entries: Array<Record<string, unknown>>;
		};

		const result = sanitize([
			{
				t: 1,
				l: "info",
				m: "https://viewer:secret@example.com/live/channel.m3u8",
			},
		]);

		expect(result.entries[0]?.m).toBe("https://example.com/live/channel.m3u8");
	});

	it("redacts Basic credentials, blob identifiers, and obfuscated keys", () => {
		const sanitize = g.sanitizeLogEntries as (value: unknown) => {
			entries: Array<Record<string, unknown>>;
		};

		const result = sanitize([
			{
				t: 1,
				l: "error",
				m: "Authorization: Basic dXNlcjpzZWNyZXQ= Worker crashed loading blob:https://www.twitch.tv/private-worker-id to\u200bken=hidden-value",
			},
		]);

		expect(result.entries[0]?.m).toBe(
			"Authorization: [redacted] Worker crashed loading blob:https://www.twitch.tv/[redacted] token=[redacted]",
		);

		const escaped = sanitize([
			{ t: 2, l: "info", m: 'token="abc\\"def" safe=value' },
		]);
		expect(escaped.entries[0]?.m).toBe("token=[redacted] safe=value");
	});

	it("keeps the newest entries within both count and byte limits", () => {
		const sanitize = g.sanitizeLogEntries as (value: unknown) => {
			entries: Array<Record<string, unknown>>;
			truncatedEntries: number;
		};
		const input = Array.from({ length: 1100 }, (_, index) => ({
			t: index,
			l: "info",
			m: `${index}:${"x".repeat(3990)}`,
			w: false,
		}));

		const result = sanitize(input);
		const byteLength = new TextEncoder().encode(
			JSON.stringify(result.entries),
		).byteLength;

		expect(result.entries.length).toBeLessThanOrEqual(1000);
		expect(byteLength).toBeLessThanOrEqual(2 * 1024 * 1024 + 2);
		expect(result.truncatedEntries + result.entries.length).toBe(input.length);
		expect(String(result.entries.at(-1)?.m)).toMatch(/^1099:/);
		expect(String(result.entries[0]?.m)).not.toMatch(/^0:/);
	});

	it("whitelists and bounds the structured page context", () => {
		const sanitize = g.sanitizeLogContext as (
			value: unknown,
		) => Record<string, unknown>;
		const workers = Array.from({ length: 14 }, (_, index) => ({
			generation: index + 1,
			mediaKey: `live:channel_${index}`,
			crashed: index === 1,
			terminated: index === 2,
			lastPongAt: 1000 + index,
			secret: "drop-me",
		}));
		const context = sanitize({
			pageUrl: "https://www.twitch.tv/some_channel?token=secret#chat",
			pageMediaKey: "live:some_channel",
			pageChannel: "Some_Channel",
			visibility: "visible",
			focused: true,
			enabled: true,
			adSpoofingEnabled: true,
			autoplayBackupEnabled: false,
			currentAdMediaKey: "live:some_channel",
			activeCycleStartedAt: 5000,
			pinnedBackupPlayerType: "site\u0000",
			pinnedBackupMediaKey: "live:some_channel",
			workers,
			media: {
				tag: "VIDEO",
				currentTime: -3,
				duration: Number.POSITIVE_INFINITY,
				paused: true,
				ended: false,
				readyState: 99,
				networkState: -2,
				playbackRate: 50,
				muted: true,
				volume: 2,
				width: 99999,
				height: 720,
				buffered: Array.from({ length: 5 }, (_, index) => ({
					start: index,
					end: index + 0.5,
				})),
			},
			secret: "drop-me",
		});

		expect(context.pageUrl).toBe("https://www.twitch.tv/some_channel");
		expect(context.pageChannel).toBe("some_channel");
		expect(context).not.toHaveProperty("secret");
		expect(context.workers).toHaveLength(12);
		expect(
			(context.workers as Array<Record<string, unknown>>)[0],
		).not.toHaveProperty("secret");
		expect(context.media).toEqual(
			expect.objectContaining({
				tag: "video",
				currentTime: 0,
				duration: null,
				readyState: 4,
				networkState: 0,
				playbackRate: 16,
				volume: 1,
				width: 16384,
			}),
		);
		expect((context.media as { buffered: unknown[] }).buffered).toHaveLength(4);
	});

	it("preserves an unavailable page context instead of inventing defaults", () => {
		const sanitize = g.sanitizeLogContext as (value: unknown) => unknown;

		expect(sanitize(null)).toBeNull();
		expect(sanitize([])).toBeNull();
	});
});

describe("runtime log collection lifecycle", () => {
	it("returns an explicit error when the page bridge is unavailable", () => {
		const response = vi.fn();

		expect(requestRuntimeLogs(response)).toBeUndefined();
		expect(response).toHaveBeenCalledWith({
			ok: false,
			error: "page-bridge-unavailable",
		});
	});

	it("routes concurrent out-of-order responses by unique request id", () => {
		vi.spyOn(Date, "now").mockReturnValue(1000);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const port = makePagePort();
		g.pageBridgePort = port;
		g.pageBridgeConnected = true;
		const firstResponse = vi.fn();
		const secondResponse = vi.fn();

		expect(requestRuntimeLogs(firstResponse)).toBe(true);
		expect(requestRuntimeLogs(secondResponse)).toBe(true);
		const firstRequest = port.messages[0]?.detail as { requestId: string };
		const secondRequest = port.messages[1]?.detail as { requestId: string };
		expect(firstRequest.requestId).not.toBe(secondRequest.requestId);

		handlePageMessage({
			type: "ttvab-logs",
			detail: {
				requestId: secondRequest.requestId,
				entries: [{ t: 2, l: "info", m: "second", w: false }],
				context: { pageUrl: "https://www.twitch.tv/second" },
				truncatedEntries: 3,
			},
		});
		handlePageMessage({
			type: "ttvab-logs",
			detail: {
				requestId: firstRequest.requestId,
				entries: [null, { t: 1, l: "info", m: "first", w: false }],
				context: { pageUrl: "https://www.twitch.tv/first" },
				truncatedEntries: 2,
			},
		});

		expect(secondResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				ok: true,
				entries: [expect.objectContaining({ m: "second" })],
				context: expect.objectContaining({
					pageUrl: "https://www.twitch.tv/second",
				}),
				truncatedEntries: 3,
			}),
		);
		expect(firstResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				ok: true,
				entries: [expect.objectContaining({ m: "first" })],
				truncatedEntries: 3,
			}),
		);
	});

	it("times out all concurrent requests and invalidates the stale port", () => {
		vi.useFakeTimers();
		const port = makePagePort();
		g.pageBridgePort = port;
		g.pageBridgeConnected = true;
		const firstResponse = vi.fn();
		const secondResponse = vi.fn();
		requestRuntimeLogs(firstResponse);
		requestRuntimeLogs(secondResponse);
		const staleRequestIds = port.messages.map(
			(message) => (message.detail as { requestId: string }).requestId,
		);

		vi.advanceTimersByTime(1500);

		expect(firstResponse).toHaveBeenCalledWith({
			ok: false,
			error: "page-response-timeout",
		});
		expect(secondResponse).toHaveBeenCalledWith({
			ok: false,
			error: "page-response-timeout",
		});
		expect(firstResponse).toHaveBeenCalledTimes(1);
		expect(secondResponse).toHaveBeenCalledTimes(1);
		expect(port.close).toHaveBeenCalledTimes(1);
		expect(g.pageBridgeConnected).toBe(false);
		expect(g.pageBridgePort).toBeNull();
		expect((g.pendingLogCollections as Map<string, unknown>).size).toBe(0);
		for (const requestId of staleRequestIds) {
			handlePageMessage({
				type: "ttvab-logs",
				detail: {
					requestId,
					entries: [{ t: 4, l: "info", m: "late", w: false }],
				},
			});
		}
		expect(firstResponse).toHaveBeenCalledTimes(1);
		expect(secondResponse).toHaveBeenCalledTimes(1);
	});

	it("reports a post failure and closes the failed port", () => {
		const port = makePagePort(true);
		g.pageBridgePort = port;
		g.pageBridgeConnected = true;
		const response = vi.fn();

		expect(requestRuntimeLogs(response)).toBe(true);

		expect(response).toHaveBeenCalledWith({
			ok: false,
			error: "page-message-failed",
		});
		expect(port.close).toHaveBeenCalledTimes(1);
		expect(g.pageBridgePort).toBeNull();
	});

	it("settles pending collections when the tab exits", () => {
		const port = makePagePort();
		g.pageBridgePort = port;
		g.pageBridgeConnected = true;
		const response = vi.fn();
		requestRuntimeLogs(response);

		window.dispatchEvent(new Event("pagehide"));

		expect(response).toHaveBeenCalledWith({
			ok: false,
			error: "page-message-failed",
		});
		expect((g.pendingLogCollections as Map<string, unknown>).size).toBe(0);
	});

	it("collects again after a replacement port completes the handshake", () => {
		vi.useFakeTimers();
		const stalePort = makePagePort();
		g.pageBridgePort = stalePort;
		g.pageBridgeConnected = true;
		requestRuntimeLogs(vi.fn());
		vi.advanceTimersByTime(1500);

		const token = "0123456789abcdef0123456789abcdef";
		const replacementPort = makePagePort();
		g.bridgeSessionToken = token;
		expect(
			(g.bindPageBridgePort as (port: unknown) => boolean)(replacementPort),
		).toBe(true);
		handlePageMessage({
			type: "ttvab-bridge-ready",
			detail: { token },
		});
		expect(g.handshakeRetryCount).toBe(0);
		const response = vi.fn();
		requestRuntimeLogs(response);
		const request = replacementPort.messages.find(
			(message) => message.type === "ttvab-collect-logs",
		);
		const requestId = (request?.detail as { requestId?: string })?.requestId;
		expect(requestId).toBeTypeOf("string");

		handlePageMessage({
			type: "ttvab-logs",
			detail: {
				requestId,
				entries: [{ t: 3, l: "success", m: "reconnected", w: false }],
				context: { pageUrl: "https://www.twitch.tv/reconnected" },
			},
		});

		expect(response).toHaveBeenCalledWith(
			expect.objectContaining({
				ok: true,
				entries: [expect.objectContaining({ m: "reconnected" })],
			}),
		);
	});

	it("ignores messages from a replaced page port", () => {
		const token = "0123456789abcdef0123456789abcdef";
		g.bridgeSessionToken = token;
		const stalePort = makePagePort();
		const replacementPort = makePagePort();
		expect(
			(g.bindPageBridgePort as (port: unknown) => boolean)(stalePort),
		).toBe(true);
		g.pageBridgeConnected = false;
		expect(
			(g.bindPageBridgePort as (port: unknown) => boolean)(replacementPort),
		).toBe(true);

		stalePort.emitMessage({
			type: "ttvab-bridge-ready",
			detail: { token },
		});
		expect(g.pageBridgeConnected).toBe(false);

		replacementPort.emitMessage({
			type: "ttvab-bridge-ready",
			detail: { token },
		});
		expect(g.pageBridgeConnected).toBe(true);
		const response = vi.fn();
		requestRuntimeLogs(response);
		const request = replacementPort.messages.find(
			(message) => message.type === "ttvab-collect-logs",
		);
		const requestId = (request?.detail as { requestId?: string }).requestId;

		stalePort.emitMessage({
			type: "ttvab-logs",
			detail: {
				requestId,
				entries: [{ t: 1, l: "info", m: "stale" }],
			},
		});
		expect(response).not.toHaveBeenCalled();

		replacementPort.emitMessage({
			type: "ttvab-logs",
			detail: {
				requestId,
				entries: [{ t: 2, l: "info", m: "current" }],
			},
		});
		expect(response).toHaveBeenCalledWith(
			expect.objectContaining({
				ok: true,
				entries: [expect.objectContaining({ m: "current" })],
			}),
		);
	});
});
