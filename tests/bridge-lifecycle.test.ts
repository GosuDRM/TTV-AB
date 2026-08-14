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
type StorageChange = { newValue?: unknown; oldValue?: unknown };
type StorageChanges = Record<string, StorageChange>;
type StorageGetCallback = (result?: Record<string, unknown>) => void;
let storageGetImplementation: (
	keys: string[],
	callback: StorageGetCallback,
) => void = () => {};
let storageChangeListener:
	| ((changes: StorageChanges, namespace: string) => void)
	| null = null;
const storageSetupOrder: string[] = [];
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
			local: {
				get: (keys: string[], callback: StorageGetCallback) => {
					storageSetupOrder.push("get");
					storageGetImplementation(keys, callback);
				},
			},
			onChanged: {
				addListener: (
					listener: (changes: StorageChanges, namespace: string) => void,
				) => {
					storageSetupOrder.push("listener");
					storageChangeListener = listener;
				},
			},
		},
	};
	loadBridge();
});

beforeEach(() => {
	runtimeMessages.length = 0;
	localStorage.clear();
	storageGetImplementation = () => {};
	(
		g.chrome as { runtime: { lastError: { message: string } | null } }
	).runtime.lastError = null;
	(g.clearScheduledRetryFlush as () => boolean)();
	(g.clearPersistedFlushRecovery as () => void)();
	if (g.flushTimeout) {
		clearTimeout(g.flushTimeout as ReturnType<typeof setTimeout>);
	}
	g.flushTimeout = null;
	g.pendingAdsDelta = 0;
	g.pendingAdChannels = Object.create(null);
	g.pendingWatchSeconds = Object.create(null);
	g.pendingAdSeconds = 0;
	g.pendingChannelAdSeconds = Object.create(null);
	g.pendingAdMeasurements = new Map();
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
	if (g.initialStorageReadTimer) {
		clearTimeout(g.initialStorageReadTimer as ReturnType<typeof setTimeout>);
	}
	g.initialStorageReadTimer = null;
	g.initialStorageReadGeneration = 0;
	g.initialStorageReadFastRetries = 0;
	g.initialStorageReadInFlight = false;
	Object.assign(g.storageChangeVersions as Record<string, number>, {
		ttvAdblockEnabled: 0,
		ttvAdSpoofingEnabled: 0,
		ttvAutoplayBackupEnabled: 0,
		ttvAdsBlocked: 0,
	});
	Object.assign(g.bridgeState as Record<string, unknown>, {
		enabled: true,
		adSpoofingEnabled: true,
		autoplayBackupEnabled: true,
		storedAdsCount: 0,
	});
	(g.pendingPageMessages as unknown[]).length = 0;
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

function finishStorageRead(
	callback: StorageGetCallback,
	result?: Record<string, unknown>,
	error: string | null = null,
) {
	const runtime = (
		g.chrome as { runtime: { lastError: { message: string } | null } }
	).runtime;
	runtime.lastError = error ? { message: error } : null;
	try {
		callback(result);
	} finally {
		runtime.lastError = null;
	}
}

describe("settings initialization lifecycle", () => {
	it("listens before reading and keeps newer changes over a stale snapshot", () => {
		expect(storageSetupOrder.slice(0, 2)).toEqual(["listener", "get"]);
		let readCallback: StorageGetCallback | null = null;
		storageGetImplementation = (_keys, callback) => {
			readCallback = callback;
		};

		(g.readInitialStorageState as () => void)();
		storageChangeListener?.(
			{
				ttvAdblockEnabled: { oldValue: false, newValue: true },
				ttvAutoplayBackupEnabled: { oldValue: false, newValue: undefined },
			},
			"local",
		);
		readCallback?.({
			ttvAdblockEnabled: false,
			ttvAdSpoofingEnabled: false,
			ttvAutoplayBackupEnabled: false,
			ttvAdsBlocked: 7,
		});

		expect(g.bridgeStateReady).toBe(true);
		expect(g.bridgeState).toEqual({
			enabled: true,
			adSpoofingEnabled: false,
			autoplayBackupEnabled: true,
			storedAdsCount: 7,
		});
	});

	it("treats removed default-on settings as enabled during live sync", () => {
		g.bridgeStateReady = true;
		Object.assign(g.bridgeState as Record<string, unknown>, {
			enabled: false,
			adSpoofingEnabled: false,
			autoplayBackupEnabled: false,
		});
		const port = makePagePort();
		g.pageBridgePort = port;
		g.pageBridgeConnected = true;

		storageChangeListener?.(
			{
				ttvAdblockEnabled: { oldValue: false, newValue: undefined },
				ttvAdSpoofingEnabled: { oldValue: false, newValue: undefined },
				ttvAutoplayBackupEnabled: { oldValue: false, newValue: undefined },
			},
			"local",
		);

		expect(g.bridgeState).toMatchObject({
			enabled: true,
			adSpoofingEnabled: true,
			autoplayBackupEnabled: true,
		});
		expect(port.messages).toEqual([
			{ type: "ttvab-toggle", detail: { enabled: true } },
			{ type: "ttvab-toggle-ad-spoofing", detail: { enabled: true } },
			{ type: "ttvab-toggle-autoplay-backup", detail: { enabled: true } },
		]);
	});

	it("times out a stalled read and ignores its late callback", () => {
		vi.useFakeTimers();
		const readCallbacks: StorageGetCallback[] = [];
		storageGetImplementation = (_keys, callback) => {
			readCallbacks.push(callback);
		};
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		(g.readInitialStorageState as () => void)();
		(g.readInitialStorageState as () => void)();
		expect(readCallbacks).toHaveLength(1);
		expect(g.initialStorageReadInFlight).toBe(true);

		vi.advanceTimersByTime(1000);
		expect(g.bridgeStateReady).toBe(false);
		expect(g.initialStorageReadInFlight).toBe(false);
		expect(errorSpy).toHaveBeenCalledWith(
			"[TTV AB] Init read error:",
			"Storage read timed out",
		);

		vi.advanceTimersByTime(250);
		expect(readCallbacks).toHaveLength(2);
		expect(g.initialStorageReadInFlight).toBe(true);

		finishStorageRead(readCallbacks[0], { ttvAdblockEnabled: false });
		expect(g.bridgeStateReady).toBe(false);
		expect((g.bridgeState as { enabled: boolean }).enabled).toBe(true);

		finishStorageRead(readCallbacks[1], { ttvAdblockEnabled: true });
		expect(g.bridgeStateReady).toBe(true);
		expect(g.initialStorageReadInFlight).toBe(false);
		expect(g.initialStorageReadTimer).toBeNull();
	});

	it("uses three fast retries then one recurring slow recovery timer", () => {
		vi.useFakeTimers();
		const readCallbacks: StorageGetCallback[] = [];
		storageGetImplementation = (_keys, callback) => {
			readCallbacks.push(callback);
		};
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		(g.readInitialStorageState as () => void)();
		for (let attempt = 0; attempt < 4; attempt++) {
			finishStorageRead(
				readCallbacks[attempt],
				undefined,
				"storage unavailable",
			);
			if (attempt < 3) {
				vi.advanceTimersByTime(249);
				expect(readCallbacks).toHaveLength(attempt + 1);
				vi.advanceTimersByTime(1);
				expect(readCallbacks).toHaveLength(attempt + 2);
			}
		}

		expect(g.bridgeStateReady).toBe(false);
		expect(g.initialStorageReadInFlight).toBe(false);
		expect(g.initialStorageReadTimer).not.toBeNull();
		vi.advanceTimersByTime(29999);
		expect(readCallbacks).toHaveLength(4);
		vi.advanceTimersByTime(1);
		expect(readCallbacks).toHaveLength(5);
		expect(g.initialStorageReadInFlight).toBe(true);

		finishStorageRead(readCallbacks[4], {
			ttvAdblockEnabled: true,
			ttvAdSpoofingEnabled: true,
			ttvAutoplayBackupEnabled: true,
		});

		expect(g.bridgeStateReady).toBe(true);
		expect(g.initialStorageReadInFlight).toBe(false);
		expect(g.initialStorageReadTimer).toBeNull();
		expect(errorSpy).toHaveBeenCalledTimes(4);
	});

	it("starts the handshake when storage resolves after an early token", () => {
		vi.useFakeTimers();
		let readCallback: StorageGetCallback | null = null;
		storageGetImplementation = (_keys, callback) => {
			readCallback = callback;
		};
		(g.readInitialStorageState as () => void)();
		const token = "0123456789abcdef0123456789abcdef";

		(g.handleBridgeTokenRequest as (event: unknown) => void)({
			source: window,
			data: {
				type: "ttvab-bridge-token-request",
				detail: { token },
			},
			stopImmediatePropagation: vi.fn(),
		});

		expect(g.bridgeSessionToken).toBe(token);
		expect(g.handshakeRetryCount).toBe(0);
		readCallback?.({});
		expect(g.bridgeStateReady).toBe(true);
		expect(g.handshakeRetryCount).toBe(1);
		expect(g.pageBridgePort).not.toBeNull();
	});
});

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

	it("preserves measured ad records through journal dispatch and confirmation", () => {
		const flush = {
			...makeExitFlush(),
			flushId: "flush:test:page-exit-0002",
			watchDeltas: {},
			adMeasurements: [
				{
					id: "stitched-ad-page-exit",
					durationMilliseconds: 15050,
					mediaKey: "live:somestreamer",
					channel: "somestreamer",
				},
			],
		};
		const storageKey = `ttvab_pending_counter_flush:${flush.flushId}`;
		localStorage.setItem(storageKey, JSON.stringify(flush));

		handlePageMessage({
			type: "ttvab-persist-counter-flush",
			detail: flush,
		});

		expect(runtimeMessages[0]).toEqual({
			type: "ttvab-persist-counters",
			detail: expect.objectContaining({
				flushId: flush.flushId,
				adMeasurements: flush.adMeasurements,
			}),
		});
		expect(runtimeMessages[1]).toEqual({
			type: "ttvab-confirm-counter-flush",
			detail: { flushId: flush.flushId },
		});
		expect(localStorage.getItem(storageKey)).toBeNull();
	});
});

describe("counter retry bounds", () => {
	it("uses bounded fast retries before one slow journal recovery loop", () => {
		vi.useFakeTimers();
		const previousSendPersistPayload = g.sendPersistPayload;
		g.sendPersistPayload = (
			_payload: unknown,
			_success: unknown,
			onFailure: (error: string) => void,
		) => onFailure("background unavailable");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const flushId = "flush:test:retry-bound-0001";
		const payload = {
			type: "ttvab-persist-counters",
			detail: {
				flushId,
				createdAt: Date.now(),
				adsDelta: 0,
				channelDeltas: {},
				watchDeltas: { somestreamer: 1 },
			},
		};

		try {
			(g.dispatchPersistPayload as (value: unknown, options: unknown) => void)(
				payload,
				{ retryOnFailure: true },
			);
			const retries = g.retryFlushEntries as Map<
				string,
				{ retryCount: number }
			>;
			expect(retries.get(flushId)?.retryCount).toBe(1);

			for (const [delay, expectedCount] of [
				[400, 2],
				[800, 3],
				[1600, 4],
				[2000, 5],
				[2000, 6],
			] as const) {
				vi.advanceTimersByTime(delay);
				expect(retries.get(flushId)?.retryCount).toBe(expectedCount);
			}

			vi.advanceTimersByTime(2000);
			expect(retries.get(flushId)).toMatchObject({
				retryCount: 6,
				timeoutId: null,
			});
			expect(errorSpy).toHaveBeenCalledTimes(7);
			expect(
				localStorage.getItem(`ttvab_pending_counter_flush:${flushId}`),
			).not.toBeNull();
			expect(g.persistedFlushRecoveryTimeout).not.toBeNull();

			g.sendPersistPayload = previousSendPersistPayload;
			vi.advanceTimersByTime(30000);

			expect(
				localStorage.getItem(`ttvab_pending_counter_flush:${flushId}`),
			).toBeNull();
			expect(retries.has(flushId)).toBe(false);
			expect(g.persistedFlushRecoveryTimeout).toBeNull();
		} finally {
			g.sendPersistPayload = previousSendPersistPayload;
		}
	});

	it("hard-caps simultaneous retry entries", () => {
		vi.useFakeTimers();
		const schedule = g.scheduleRetryFlush as (
			payload: unknown,
			flushId: string,
		) => boolean;
		for (let index = 0; index < 65; index++) {
			const flushId = `flush:test:retry-${String(index).padStart(4, "0")}`;
			schedule(
				{
					type: "ttvab-persist-counters",
					detail: { flushId },
				},
				flushId,
			);
		}
		const retries = g.retryFlushEntries as Map<string, unknown>;

		expect(retries.size).toBe(64);
		expect(retries.has("flush:test:retry-0000")).toBe(false);
		expect(retries.has("flush:test:retry-0064")).toBe(true);
	});

	it("keeps one bounded slow retry when the journal is temporarily unavailable", () => {
		vi.useFakeTimers();
		const previousSendPersistPayload = g.sendPersistPayload;
		g.sendPersistPayload = (
			_payload: unknown,
			_success: unknown,
			onFailure: (error: string) => void,
		) => onFailure("background unavailable");
		const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const flushId = "flush:test:memory-recovery-0001";
		const payload = {
			type: "ttvab-persist-counters",
			detail: {
				flushId,
				createdAt: Date.now(),
				adsDelta: 0,
				channelDeltas: {},
				watchDeltas: { somestreamer: 1 },
			},
		};

		try {
			(g.dispatchPersistPayload as (value: unknown, options: unknown) => void)(
				payload,
				{ retryOnFailure: true },
			);
			for (const delay of [400, 800, 1600, 2000, 2000, 2000]) {
				vi.advanceTimersByTime(delay);
			}
			const retries = g.retryFlushEntries as Map<string, unknown>;
			expect(retries.has(flushId)).toBe(true);
			expect(
				localStorage.getItem(`ttvab_pending_counter_flush:${flushId}`),
			).toBeNull();
			expect(g.persistedFlushRecoveryTimeout).not.toBeNull();

			setItem.mockRestore();
			g.sendPersistPayload = previousSendPersistPayload;
			vi.advanceTimersByTime(30000);

			expect(retries.has(flushId)).toBe(false);
			expect(g.persistedFlushRecoveryTimeout).toBeNull();
		} finally {
			setItem.mockRestore();
			g.sendPersistPayload = previousSendPersistPayload;
			errorSpy.mockRestore();
		}
	});
});

describe("measured ad duration batching", () => {
	it("normalizes and journals unique records before background persistence", () => {
		const startDateMilliseconds = Date.parse("2026-08-12T10:00:00.000Z");
		handlePageMessage({
			type: "ttvab-ad-seconds",
			detail: {
				mediaKey: "live:somestreamer",
				channel: "somestreamer",
				measurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15050,
						startDateMilliseconds,
					},
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15050,
						startDateMilliseconds,
					},
					{ id: "not-stitched", durationMilliseconds: 30000 },
				],
			},
		});
		handlePageMessage({
			type: "ttvab-ad-seconds",
			detail: {
				mediaKey: "live:somestreamer",
				channel: "somestreamer",
				measurements: [
					{ id: "stitched-ad-second", durationMilliseconds: 30000 },
				],
			},
		});

		(g.flushCounters as (options: unknown) => void)({ fireAndForget: true });

		const persisted = runtimeMessages.find(
			(message) => message.type === "ttvab-persist-counters",
		);
		expect(persisted).toEqual({
			type: "ttvab-persist-counters",
			detail: expect.objectContaining({
				adMeasurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 15050,
						startDateMilliseconds,
						mediaKey: "live:somestreamer",
						channel: "somestreamer",
					},
					{
						id: "stitched-ad-second",
						durationMilliseconds: 30000,
						mediaKey: "live:somestreamer",
						channel: "somestreamer",
					},
				],
			}),
		});
		expect((g.pendingAdMeasurements as Map<string, unknown>).size).toBe(0);
	});

	it("keeps legacy aggregates separate from new per-ad records", () => {
		handlePageMessage({
			type: "ttvab-ad-seconds",
			detail: {
				seconds: 30,
				channel: "somestreamer",
				mediaKey: "live:somestreamer",
			},
		});
		handlePageMessage({
			type: "ttvab-ad-seconds",
			detail: {
				channel: "somestreamer",
				mediaKey: "live:somestreamer",
				measurements: [
					{ id: "stitched-ad-current", durationMilliseconds: 15000 },
				],
			},
		});
		(g.flushCounters as (options: unknown) => void)({ fireAndForget: true });

		const persistedDetails = runtimeMessages
			.filter((message) => message.type === "ttvab-persist-counters")
			.map((message) => message.detail as Record<string, unknown>);
		expect(persistedDetails).toHaveLength(2);
		expect(persistedDetails[0]).toMatchObject({ adSecondsDelta: 30 });
		expect(persistedDetails[0]).not.toHaveProperty("adMeasurements");
		expect(persistedDetails[1]).toMatchObject({
			adMeasurements: [
				expect.objectContaining({
					id: "stitched-ad-current",
					durationMilliseconds: 15000,
				}),
			],
		});
		expect(persistedDetails[1]).not.toHaveProperty("adSecondsDelta");
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
				errorCode: 99,
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
				errorCode: 4,
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
