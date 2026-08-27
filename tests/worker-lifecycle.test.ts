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

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/logger.js");
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/api.js");
	loadModule("../dist/src/modules/processor.js");
	loadModule("../dist/src/modules/hooks.js");
	loadModule("../dist/src/modules/worker.js");
});

beforeEach(() => {
	g._S = {
		workers: [],
		conflicts: [],
		reinsertPatterns: [],
		toleratedWorkerWrappers: [],
		adsBlocked: 0,
	};
	g.__TTVAB_STATE__ = {
		PageMediaType: "live",
		PageChannel: "testchannel",
		PageVodID: null,
		PageMediaKey: "live:testchannel",
		IsAdStrippingEnabled: true,
		LastPlayerReloadAt: 0,
		LastPlayerReloadAtByMediaKey: Object.create(null),
	};
	g._log = () => {};
	if (g._bridgeTokenRequestTimer) {
		clearTimeout(g._bridgeTokenRequestTimer as ReturnType<typeof setTimeout>);
	}
	g._bridgePort = null;
	g._bridgePortHandshakeBound = false;
	g._bridgeSessionToken = null;
	g._bridgeTokenRequestTimer = null;
	g._bridgeTokenRequestCount = 0;
	(g._WorkerRecoveryStates as Map<string, unknown>).clear();
	(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).clear();
	(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
	(g._pageSideVariantCodecByUrl as Map<string, unknown>).clear();
	(g._pageSidePlaybackOwnerByUrl as Map<string, unknown>).clear();
	(g._pageAdCycleControlByMediaKey as Map<string, unknown>).clear();
	(g._trackedExtensionBlobUrls as Set<string>).clear();
	g._workerGeneration = 0;
	g._workerRecoveryEpoch = 0;
	window.history.replaceState(null, "", "/testchannel");
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete g._doPlayerTask;
	delete g._schedulePlaybackRecoveryTimeout;
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function recordTestPlayerReload(mediaKey: string, at = Date.now()) {
	(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt = at;
	return T<(key: string, reloadedAt: number) => number>(
		"_recordPlayerReloadAt",
	)(mediaKey, at);
}

function installCycleFencedRecoveryScheduler() {
	const schedule = vi.fn(
		(
			callback: () => void,
			delay: number,
			_channel: string | null,
			mediaKey: string | null,
			cycleStartedAt: number,
		) =>
			setTimeout(() => {
				if (
					cycleStartedAt > 0 &&
					!T<(key: string | null, cycle: number) => boolean>(
						"_isPageLifecycleCycleCurrent",
					)(mediaKey, cycleStartedAt)
				) {
					return;
				}
				callback();
			}, delay),
	);
	g._schedulePlaybackRecoveryTimeout = schedule;
	return schedule;
}

function confirmPlaybackOwner(
	mediaKey: string,
	playlistUrl: string,
	codec: string,
	cycleStartedAt = 0,
	options: {
		decoderCodec?: string | null;
		generation?: number;
		handoffId?: string | null;
		observedAt?: number;
	} = {},
) {
	const generation = options.generation ?? 1;
	const observedAt = options.observedAt ?? Date.now();
	const worker = {
		__TTVABGeneration: generation,
		__TTVABFirstPongAt: observedAt,
		__TTVABLastPongAt: observedAt,
		__TTVABPageMediaKey: mediaKey,
		__TTVABPlaybackObservedAtByMediaKey: new Map([[mediaKey, observedAt]]),
	};
	T<
		(
			worker: Record<string, unknown>,
			now?: number,
			context?: Record<string, unknown>,
		) => boolean
	>("_promoteWorkerPlaybackOwner")(worker, observedAt, { MediaKey: mediaKey });
	T<
		(
			mediaKey: string,
			playlistUrl: string,
			codec: string,
			cycleStartedAt: number,
			ownership: Record<string, unknown>,
		) => boolean
	>("_rememberPageSidePlaybackOwner")(
		mediaKey,
		playlistUrl,
		codec,
		cycleStartedAt,
		{
			confirmedPlayback: true,
			workerGeneration: generation,
			handoffId: options.handoffId ?? null,
			decoderCodec: options.decoderCodec ?? codec,
		},
	);
	return worker;
}

function makeBridgePort() {
	return {
		messages: [] as unknown[],
		started: false,
		closed: false,
		postMessage(message: unknown) {
			this.messages.push(message);
		},
		addEventListener() {},
		removeEventListener() {},
		start() {
			this.started = true;
		},
		close() {
			this.closed = true;
		},
	};
}

function installWorkerMessageHarness(
	options: { preserveBlobSources?: boolean } = {},
) {
	const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(
		window,
		"Worker",
	);
	const originalBlobDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"Blob",
	);
	const originalXMLHttpRequestDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"XMLHttpRequest",
	);
	const originalCreateObjectURLDescriptor = Object.getOwnPropertyDescriptor(
		URL,
		"createObjectURL",
	);
	const originalRevokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(
		URL,
		"revokeObjectURL",
	);
	const blobSources = new Map<string, string>();
	let blobSequence = 0;
	class TestBlob {
		source: string;

		constructor(parts: unknown[]) {
			this.source = parts.map(String).join("");
		}
	}
	class TestXMLHttpRequest {
		responseText = "";
		url = "";

		open(_method: string, url: string) {
			this.url = url;
		}

		overrideMimeType() {}

		send() {
			this.responseText = blobSources.get(this.url) || "";
		}
	}
	class TestWorker extends EventTarget {
		messages: unknown[] = [];
		url = "";
		source = "";

		constructor(url: unknown, ..._args: unknown[]) {
			super();
			this.url = String(url);
			this.source = blobSources.get(this.url) || "";
		}

		postMessage(message: unknown) {
			this.messages.push(message);
		}

		terminate() {}

		emitMessage(message: Record<string, unknown>) {
			const envelope = T<(value: Record<string, unknown>) => unknown>(
				"_createWorkerBridgeMessage",
			)(message);
			this.dispatchEvent(new MessageEvent("message", { data: envelope }));
		}
	}
	const restore = () => {
		if (g._workerWatchdogID !== null) {
			clearInterval(g._workerWatchdogID as ReturnType<typeof setInterval>);
			g._workerWatchdogID = null;
		}
		(g._S as { workers: unknown[] }).workers = [];
		(g._pageAdCycleControlByMediaKey as Map<string, unknown>).clear();
		if (originalWorkerDescriptor) {
			Object.defineProperty(window, "Worker", originalWorkerDescriptor);
		} else {
			delete (window as unknown as Record<string, unknown>).Worker;
		}
		if (originalBlobDescriptor) {
			Object.defineProperty(globalThis, "Blob", originalBlobDescriptor);
		} else {
			delete (globalThis as Record<string, unknown>).Blob;
		}
		if (originalXMLHttpRequestDescriptor) {
			Object.defineProperty(
				globalThis,
				"XMLHttpRequest",
				originalXMLHttpRequestDescriptor,
			);
		} else {
			delete (globalThis as Record<string, unknown>).XMLHttpRequest;
		}
		if (originalCreateObjectURLDescriptor) {
			Object.defineProperty(
				URL,
				"createObjectURL",
				originalCreateObjectURLDescriptor,
			);
		} else {
			delete (URL as unknown as Record<string, unknown>).createObjectURL;
		}
		if (originalRevokeObjectURLDescriptor) {
			Object.defineProperty(
				URL,
				"revokeObjectURL",
				originalRevokeObjectURLDescriptor,
			);
		} else {
			delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
		}
	};

	try {
		if (options.preserveBlobSources) {
			Object.defineProperty(globalThis, "Blob", {
				configurable: true,
				value: TestBlob,
			});
			Object.defineProperty(globalThis, "XMLHttpRequest", {
				configurable: true,
				value: TestXMLHttpRequest,
			});
		}
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: vi.fn((blob: TestBlob) => {
				const url = options.preserveBlobSources
					? `blob:https://www.twitch.tv/ttvab-test-worker-${++blobSequence}`
					: "blob:https://www.twitch.tv/ttvab-test-worker";
				if (options.preserveBlobSources) {
					blobSources.set(url, blob.source);
				}
				return url;
			}),
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn(),
		});
		Object.defineProperty(window, "Worker", {
			configurable: true,
			writable: true,
			value: TestWorker,
		});
		T<() => void>("_hookWorker")();
		const createWorker = () =>
			new window.Worker(
				"https://static.twitchcdn.net/assets/player-worker.js",
			) as unknown as TestWorker;
		const worker = createWorker();
		return { worker, createWorker, restore, blobSources };
	} catch (error) {
		restore();
		throw error;
	}
}

function emitHarnessWorkerPong(worker: {
	emitMessage: (message: Record<string, unknown>) => void;
}) {
	worker.emitMessage({ key: "Pong" });
}

function confirmHarnessWorkerPlayback(
	worker: { emitMessage: (message: Record<string, unknown>) => void },
	playlistUrl = "https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8",
) {
	emitHarnessWorkerPong(worker);
	worker.emitMessage({
		key: "PlaybackWorkerObserved",
		mediaType: "live",
		channel: "testchannel",
		mediaKey: "live:testchannel",
		playlistUrl,
		codec: "avc1.64002A",
	});
}

function setProvisionalTerminalState(lastEndedAt: number) {
	const state = g.__TTVAB_STATE__ as Record<string, unknown>;
	Object.assign(state, {
		PageMediaType: "live",
		PageChannel: "testchannel",
		PageVodID: null,
		PageMediaKey: "live:testchannel",
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		PinnedBackupPlayerMediaKey: null,
		ActiveCodecHandoffId: null,
		ActiveCodecHandoffChannel: null,
		ActiveCodecHandoffMediaKey: null,
		AdPodProgressByMediaKey: Object.create(null),
		StreamInfos: Object.create(null),
		StreamInfosByUrl: Object.create(null),
		LastAdEndedAt: lastEndedAt,
		LastAdEndedChannel: "testchannel",
		LastAdEndedMediaKey: "live:testchannel",
		LastAdEndedCycleStartedAt: 90000,
		AdCycleStaleMs: 120000,
	});
	return state;
}

function emitProvisionalContinuation(
	worker: { emitMessage: (message: Record<string, unknown>) => void },
	detectedAt: number,
) {
	worker.emitMessage({
		key: "AdDetected",
		channel: "testchannel",
		mediaKey: "live:testchannel",
		pageChannel: "testchannel",
		pageMediaKey: "live:testchannel",
		continued: true,
		cycleStartedAt: 90000,
		detectedAt,
		playlistUrl:
			"https://video-weaver.example.ttvnw.net/v1/playlist/provisional.m3u8",
	});
}

function emitNativePlaybackRestored(
	worker: { emitMessage: (message: Record<string, unknown>) => void },
	restoredAt: number,
) {
	worker.emitMessage({
		key: "NativePlaybackRestored",
		channel: "testchannel",
		mediaKey: "live:testchannel",
		pageChannel: "testchannel",
		pageMediaKey: "live:testchannel",
		cycleStartedAt: 90000,
		restoredAt,
		requiresReload: true,
	});
}

describe("worker log ingestion", () => {
	it("tags, bounds, normalizes, and redacts worker log entries", () => {
		delete g.__TTVAB_LOGS__;
		const { worker, restore } = installWorkerMessageHarness();

		try {
			worker.emitMessage({
				key: "LogEntry",
				value: {
					t: 1234,
					l: "warning",
					m: "https://edge.example/live.m3u8?token=worker-secret&sig=signature-secret",
				},
			});
			const entries = g.__TTVAB_LOGS__ as Array<Record<string, unknown>>;
			expect(entries).toHaveLength(1);
			expect(entries[0]).toEqual({
				t: 1234,
				l: "warning",
				m: "https://edge.example/live.m3u8?token=[redacted]&sig=[redacted]",
				w: true,
				g: 1,
				k: "live:testchannel",
			});

			Object.assign(worker, {
				__TTVABGeneration: Number.MAX_VALUE,
				__TTVABPageMediaKey: "invalid-media-key",
			});
			worker.emitMessage({
				key: "LogEntry",
				value: {
					t: Number.MAX_VALUE,
					l: "info",
					m: "x".repeat(5000),
				},
			});
			expect(entries[1]).toMatchObject({
				l: "info",
				w: true,
				g: 1000000,
				k: null,
			});
			expect(Number(entries[1]?.t)).toBeLessThanOrEqual(8640000000000000);
			expect(String(entries[1]?.m)).toHaveLength(4000);

			worker.emitMessage({
				key: "LogEntry",
				value: {
					t: {
						valueOf: vi.fn(() => {
							throw new Error("timestamp coercion attempted");
						}),
					},
					l: "info",
					m: { huge: new Array(100000) },
				},
			});
			expect(entries[2]?.m).toBe("[Invalid worker log message]");
		} finally {
			restore();
			delete g.__TTVAB_LOGS__;
		}
	});

	it("keeps worker log ingestion isolated from a poisoned page buffer", () => {
		const { proxy, revoke } = Proxy.revocable([], {});
		g.__TTVAB_LOGS__ = proxy;
		revoke();
		const { worker, restore } = installWorkerMessageHarness();

		try {
			expect(() =>
				worker.emitMessage({
					key: "LogEntry",
					value: { t: 1, l: "info", m: "safe" },
				}),
			).not.toThrow();
		} finally {
			restore();
			delete g.__TTVAB_LOGS__;
		}
	});
});

describe("post-ad native reload acknowledgement", () => {
	it("forwards exact current-worker proof and ignores stale playback context", () => {
		const confirm = vi.fn(() => true);
		g._confirmPostAdNativeReload = confirm;
		const { worker, restore } = installWorkerMessageHarness();

		try {
			worker.emitMessage({
				key: "PostAdNativeReloadReady",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				reloadAt: 100000,
				confirmedAt: 100100,
			});
			expect(confirm).toHaveBeenCalledWith({
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				reloadAt: 100000,
				confirmedAt: 100100,
			});

			worker.emitMessage({
				key: "PostAdNativeReloadReady",
				channel: "otherchannel",
				mediaKey: "live:otherchannel",
				pageChannel: "otherchannel",
				pageMediaKey: "live:otherchannel",
				cycleStartedAt: 90000,
				reloadAt: 100000,
				confirmedAt: 100100,
			});
			expect(confirm).toHaveBeenCalledOnce();
		} finally {
			restore();
			delete g._confirmPostAdNativeReload;
		}
	});
});

describe("MAIN bridge token handshake", () => {
	it("rejects arbitrary page bridge tokens before MAIN creates one", () => {
		const attachBridgePort =
			T<(port: MessagePort, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const port = makeBridgePort();

		expect(
			attachBridgePort(port as unknown as MessagePort, "x".repeat(48)),
		).toBe(false);
		expect(port.started).toBe(false);
	});

	it("accepts only the current MAIN-created bridge token", () => {
		const getBridgeSessionToken = T<() => string>("_getBridgeSessionToken");
		const attachBridgePort =
			T<(port: MessagePort, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const sessionToken = getBridgeSessionToken();
		const wrongPort = makeBridgePort();

		expect(
			attachBridgePort(wrongPort as unknown as MessagePort, "y".repeat(48)),
		).toBe(false);
		expect(wrongPort.started).toBe(false);

		const acceptedPort = makeBridgePort();
		expect(
			attachBridgePort(acceptedPort as unknown as MessagePort, sessionToken),
		).toBe(true);
		expect(acceptedPort.started).toBe(true);
	});
});

describe("worker recovery lifecycle", () => {
	it("keeps one playback hook when a compatible extension wraps the exposed Worker", () => {
		const harness = installWorkerMessageHarness();
		try {
			const exposedWorker = window.Worker;
			class CompatibleWorker extends exposedWorker {}
			window.Worker = CompatibleWorker;

			const wrappedWorker = harness.createWorker();
			const workers = (g._S as { workers: Worker[] }).workers;

			expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
			expect(workers).toHaveLength(2);
			expect(new Set(workers).size).toBe(2);
			expect(workers[1]).toBe(wrappedWorker);
			expect(g._workerGeneration).toBe(2);
		} finally {
			harness.restore();
		}
	});

	it("keeps one playback hook when TwitchNoSub copies the worker blob", () => {
		const harness = installWorkerMessageHarness({ preserveBlobSources: true });
		try {
			const state = g._S as {
				conflicts: string[];
				toleratedWorkerWrappers: Array<{
					name: string;
					signatures: string[];
				}>;
			};
			state.conflicts = ["twitch", "isVariantA"];
			state.toleratedWorkerWrappers = [
				{
					name: "TwitchNoSub",
					signatures: ["${patch_url}", "twitchBlobUrl", "getWasmWorkerJs"],
				},
			];
			const exposedWorker = window.Worker;
			const getWasmWorkerJs = (twitchBlobUrl: string) => {
				const request = new XMLHttpRequest();
				request.open("GET", twitchBlobUrl, false);
				request.send();
				return request.responseText;
			};
			class TwitchNoSubWorker extends exposedWorker {
				constructor(twitchBlobUrl: string | URL, opts?: WorkerOptions) {
					const patch_url = "chrome-extension://test/patch_amazonworker.js";
					const workerString = getWasmWorkerJs(String(twitchBlobUrl));
					const blobUrl = URL.createObjectURL(
						new Blob([`importScripts('${patch_url}');\n${workerString}`]),
					);
					super(blobUrl, opts);
				}
			}
			window.Worker = TwitchNoSubWorker;

			const wrappedWorker = harness.createWorker();
			const initialMarkers =
				harness.worker.source.match(/__TTVAB_WORKER_HOOK_/g);
			const initialHookLogs =
				harness.worker.source.match(/Worker fetch hooked/g);
			const markers = wrappedWorker.source.match(/__TTVAB_WORKER_HOOK_/g) || [];
			const hookLogs = wrappedWorker.source.match(/Worker fetch hooked/g) || [];
			const workers = (g._S as { workers: Worker[] }).workers;

			expect(initialMarkers).toHaveLength(1);
			expect(initialHookLogs).toHaveLength(1);
			expect(markers).toHaveLength(1);
			expect(hookLogs).toHaveLength(1);
			expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
			expect(workers).toHaveLength(2);
			expect(workers[1]).toBe(wrappedWorker);
			expect(g._workerGeneration).toBe(2);
		} finally {
			harness.restore();
		}
	});

	it("caps recovery attempts across replacement workers for the same playback context", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const context = { MediaType: "live", ChannelName: "testchannel" };
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");

		expect(recordAttempt(context, 1000)).toBe(true);
		expect(recordAttempt(context, 2000)).toBe(true);
		expect(recordAttempt(context, 3000)).toBe(true);
		expect(recordAttempt(context, 4000)).toBe(false);
		expect(getRecoveryState(context).attempts).toBe(3);
	});

	it("resets the cap only after a replacement worker stays healthy", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const resetIfStable = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				now?: number,
			) => void
		>("_resetWorkerRecoveryStateIfStable");
		const context = { MediaType: "live", ChannelName: "testchannel" };
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const worker = {
			__TTVABGeneration: 2,
			__TTVABFirstPongAt: 2000,
			__TTVABLastPongAt: 61999,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 2000],
			]),
		};

		expect(recordAttempt(context, 1000)).toBe(true);
		const recoveryState = getRecoveryState(context);
		recoveryState.phase = "stabilizing";
		recoveryState.stableGeneration = 2;
		recoveryState.stableSince = 2000;

		resetIfStable(worker, context, 61999);
		expect(recoveryState.attempts).toBe(1);

		worker.__TTVABLastPongAt = 62000;
		resetIfStable(worker, context, 62000);
		expect(recoveryState.attempts).toBe(1);

		worker.__TTVABPlaybackObservedAtByMediaKey.set("live:testchannel", 62000);
		resetIfStable(worker, context, 62000);
		expect(recoveryState.attempts).toBe(0);
		expect(recoveryState.phase).toBe("idle");
	});

	it("rearms an exhausted context only for exact post-crash playback proof", () => {
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const beginStabilization = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				now?: number,
			) => boolean
		>("_beginExhaustedWorkerRecoveryStabilization");
		const recoveryState = getRecoveryState(context);
		recoveryState.attempts = 3;
		recoveryState.failedGeneration = 1;
		recoveryState.crashedAt = 1000;
		recoveryState.phase = "exhausted";
		recoveryState.activeEpoch = 0;

		const wrongMedia = {
			__TTVABGeneration: 2,
			__TTVABFirstPongAt: 2000,
			__TTVABPageMediaKey: "live:otherchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:otherchannel", 2000],
			]),
		};
		markPong(wrongMedia, 2000);
		expect(recoveryState.phase).toBe("exhausted");

		const preCrashObservation = {
			__TTVABGeneration: 2,
			__TTVABFirstPongAt: 2000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([["live:testchannel", 999]]),
		};
		markPong(preCrashObservation, 2000);
		expect(recoveryState.phase).toBe("exhausted");

		const replacement = {
			__TTVABGeneration: 2,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map<string, number>(),
		};
		markPong(replacement, 2000);
		expect(recoveryState.phase).toBe("exhausted");

		replacement.__TTVABPlaybackObservedAtByMediaKey.set(
			"live:testchannel",
			2001,
		);
		expect(beginStabilization(replacement, context, 2001)).toBe(true);
		expect(recoveryState.phase).toBe("stabilizing");
		expect(recoveryState.attempts).toBe(3);
		expect(recoveryState.stableGeneration).toBe(2);
		expect(recoveryState.retiredThroughGeneration).toBe(1);

		markPong(replacement, 62000);
		expect(recoveryState.attempts).toBe(3);
		replacement.__TTVABPlaybackObservedAtByMediaKey.set(
			"live:testchannel",
			62001,
		);
		markPong(replacement, 62001);
		expect(recoveryState.attempts).toBe(0);
		expect(recoveryState.phase).toBe("idle");
	});

	it("starts exhausted stabilization when playlist proof precedes Pong", () => {
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")(context);
		recoveryState.attempts = 3;
		recoveryState.failedGeneration = 1;
		recoveryState.crashedAt = 1000;
		recoveryState.phase = "exhausted";
		const replacement = {
			__TTVABGeneration: 2,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 2000],
			]),
		};

		T<(worker: Record<string, unknown>, now?: number) => void>(
			"_markWorkerPong",
		)(replacement, 2000);

		expect(recoveryState.phase).toBe("stabilizing");
		expect(recoveryState.attempts).toBe(3);
	});

	it.each(["cancelled", "degraded-pip"])(
		"clears %s recovery debt only after sustained successor playback",
		(phase) => {
			const context = {
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			};
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")(context);
			recoveryState.attempts = 2;
			recoveryState.failedGeneration = 1;
			recoveryState.crashedAt = 1000;
			recoveryState.phase = phase;
			const replacement = {
				__TTVABGeneration: 2,
				__TTVABPageMediaKey: "live:testchannel",
				__TTVABPlaybackObservedAtByMediaKey: new Map([
					["live:testchannel", 2000],
				]),
			};

			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			)(replacement, 2000);
			expect(recoveryState.phase).toBe("stabilizing");
			expect(recoveryState.attempts).toBe(2);

			replacement.__TTVABPlaybackObservedAtByMediaKey.set(
				"live:testchannel",
				62000,
			);
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			)(replacement, 62000);
			expect(recoveryState.attempts).toBe(0);
			expect(recoveryState.phase).toBe("idle");
		},
	);

	it("returns to exhausted after a provisional replacement fails early", () => {
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")(context);
		recoveryState.attempts = 3;
		recoveryState.limitLogged = true;
		recoveryState.phase = "scheduled";
		recoveryState.activeEpoch = 7;
		const worker = {
			__TTVABCrashed: true,
			__TTVABGeneration: 2,
			__TTVABRecoveryEpoch: 7,
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};

		T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => void
		>("_attemptWorkerRestart")(worker, context);

		expect(recoveryState.phase).toBe("exhausted");
		expect(recoveryState.activeEpoch).toBe(0);
		expect(worker.__TTVABRecoveryEpoch).toBe(0);
	});

	it("keeps recovery caps independent across playback contexts", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const first = { MediaType: "live", ChannelName: "first" };
		const second = { MediaType: "live", ChannelName: "second" };

		expect(recordAttempt(first, 1000)).toBe(true);
		expect(recordAttempt(first, 2000)).toBe(true);
		expect(recordAttempt(second, 3000)).toBe(true);

		expect(getRecoveryState(first).attempts).toBe(2);
		expect(getRecoveryState(second).attempts).toBe(1);
	});

	it("bounds playback owners without re-promoting evicted historical contexts", () => {
		const promote = T<
			(
				worker: Record<string, unknown>,
				now?: number,
				context?: Record<string, unknown>,
			) => boolean
		>("_promoteWorkerPlaybackOwner");
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const observations = new Map<string, number>();
		for (let index = 0; index < 33; index++) {
			observations.set(`live:channel${index}`, 100000);
		}
		const worker = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:channel32",
			__TTVABPlaybackObservedAtByMediaKey: observations,
		};
		for (let index = 0; index < 33; index++) {
			expect(
				promote(worker, 100000, { MediaKey: `live:channel${index}` }),
			).toBe(true);
		}
		const owners = g._WorkerPlaybackOwnerGenerationByContext as Map<
			string,
			number
		>;
		expect(owners.size).toBe(32);
		expect(owners.has("live:channel0")).toBe(false);

		markPong(worker, 100001);
		expect(owners.size).toBe(32);
		expect(owners.has("live:channel0")).toBe(false);
		expect(owners.get("live:channel32")).toBe(1);
	});

	it("tracks latest page context on worker objects so SPA navigation is not stale", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const getContext = T<
			(
				worker: Record<string, unknown>,
				fallback?: Record<string, unknown>,
			) => Record<string, unknown>
		>("_getWorkerPlaybackContext");
		const worker: Record<string, unknown> = {};

		rememberContext(worker, { MediaType: "live", ChannelName: "oldchannel" });
		rememberContext(worker, { MediaType: "live", ChannelName: "newchannel" });

		expect(worker.__TTVABPageChannel).toBe("newchannel");
		expect(worker.__TTVABPageMediaKey).toBe("live:newchannel");
		expect(getContext(worker).MediaKey).toBe("live:newchannel");
	});

	it("does not reuse stale playback proof after navigating away and back", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "first",
			MediaKey: "live:first",
		});
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = () => false;
		const oldWorker = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 99000,
			__TTVABLastPongAt: 100000,
			__TTVABPlaybackObservedAtByMediaKey: new Map([["live:first", 99500]]),
			__TTVABPlaybackBootstrapObservedAtByMediaKey: new Map([
				["live:first", 99000],
			]),
		};
		rememberContext(oldWorker, {
			MediaType: "live",
			ChannelName: "first",
		});
		markPong(oldWorker, 100000);
		rememberContext(oldWorker, {
			MediaType: "live",
			ChannelName: "second",
		});
		rememberContext(oldWorker, {
			MediaType: "live",
			ChannelName: "first",
		});
		const owners = g._WorkerPlaybackOwnerGenerationByContext as Map<
			string,
			number
		>;
		owners.clear();
		markPong(oldWorker, 100001);
		expect(
			oldWorker.__TTVABPlaybackObservedAtByMediaKey.has("live:first"),
		).toBe(false);
		expect(
			oldWorker.__TTVABPlaybackBootstrapObservedAtByMediaKey.has("live:first"),
		).toBe(false);
		expect(owners.has("live:first")).toBe(false);

		const newWorker = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 100001,
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "first",
			__TTVABPageMediaKey: "live:first",
		};
		(g._S as { workers: unknown[] }).workers = [oldWorker, newWorker];

		try {
			expect(recover(newWorker, {}, "Revisited playback worker crashed")).toBe(
				true,
			);
			expect(installFallback).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("keeps the pip worker on its original context when the page navigates", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const getContext = T<
			(worker: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerPlaybackContext");
		const broadcast =
			T<(message: Record<string, unknown>) => void>("_broadcastWorkers");
		const pipWorker = { postMessage: vi.fn() };
		const pageWorker = { postMessage: vi.fn() };
		rememberContext(pipWorker, {
			MediaType: "live",
			ChannelName: "pipchannel",
		});
		rememberContext(pageWorker, {
			MediaType: "live",
			ChannelName: "oldpage",
		});
		(g._S as { workers: unknown[] }).workers = [pipWorker, pageWorker];

		broadcast({
			key: "UpdatePageContext",
			value: {
				mediaType: "live",
				channelName: "newpage",
				mediaKey: "live:newpage",
				preservedMediaKey: "live:pipchannel",
			},
		});

		expect(getContext(pipWorker).MediaKey).toBe("live:pipchannel");
		expect(getContext(pageWorker).MediaKey).toBe("live:newpage");
	});

	it("keeps a preserved PiP reload fence across page navigation", () => {
		const setPageContext = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_setPagePlaybackContext");
		const previousGetPip = g._getActivePictureInPicturePlaybackContext;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "oldpage",
			PageMediaKey: "live:oldpage",
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			AdPodProgressByMediaKey: Object.create(null),
		});
		g._getActivePictureInPicturePlaybackContext = () => ({
			MediaType: "live",
			ChannelName: "pipchannel",
			MediaKey: "live:pipchannel",
		});
		recordTestPlayerReload("live:pipchannel", 12345);

		try {
			setPageContext({
				MediaType: "live",
				ChannelName: "newpage",
				MediaKey: "live:newpage",
			});
			expect(
				T<(mediaKey: string) => number>("_getPlayerReloadAtForMediaKey")(
					"live:pipchannel",
				),
			).toBe(12345);
		} finally {
			g._getActivePictureInPicturePlaybackContext = previousGetPip;
		}
	});

	it("sends ad-context updates only to workers for the matching stream", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const broadcast =
			T<(message: Record<string, unknown>) => void>("_broadcastWorkers");
		const pipWorker = { postMessage: vi.fn() };
		const pageWorker = { postMessage: vi.fn() };
		rememberContext(pipWorker, {
			MediaType: "live",
			ChannelName: "pipchannel",
		});
		rememberContext(pageWorker, {
			MediaType: "live",
			ChannelName: "pagechannel",
		});
		(g._S as { workers: unknown[] }).workers = [pipWorker, pageWorker];

		broadcast({
			key: "UpdateCurrentAdContext",
			targetMediaKey: "live:pipchannel",
			value: {
				channelName: "pipchannel",
				mediaKey: "live:pipchannel",
			},
		});

		expect(pipWorker.postMessage).toHaveBeenCalledOnce();
		expect(pageWorker.postMessage).not.toHaveBeenCalled();
	});

	it("clears missed heartbeat count when a worker replies", () => {
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker: Record<string, unknown> = {
			__TTVABMissedPongs: 1,
		};

		markPong(worker, 1000);

		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABLastPongAt).toBe(1000);
	});

	it("keeps recovery-critical messages from a crashed current worker alive", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const worker: Record<string, unknown> = {
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		const pageContext = { MediaType: "live", ChannelName: "testchannel" };
		const currentContext = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		expect(
			canHandle({ key: "FetchRequest" }, worker, pageContext, currentContext),
		).toBe(true);
		expect(
			canHandle(
				{ key: "NativePlaybackRestored" },
				worker,
				pageContext,
				currentContext,
			),
		).toBe(true);
		expect(
			canHandle({ key: "Pong" }, worker, pageContext, currentContext),
		).toBe(false);
		expect(
			canHandle({ key: "FetchRequest" }, worker, pageContext, {
				MediaType: "live",
				ChannelName: "otherchannel",
				MediaKey: "live:otherchannel",
			}),
		).toBe(false);
	});

	it("accepts media-bootstrap recovery only for the worker's exact active cycle", () => {
		const handleRequest = T<
			(
				worker: Record<string, unknown>,
				data: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_handleMediaBootstrapRecoveryRequest");
		const previousRecover = g._recoverCrashedWorker;
		const recover = vi.fn(() => true);
		g._recoverCrashedWorker = recover;
		const worker = {
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		const pageContext = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const data = {
			key: "MediaBootstrapRecoveryNeeded",
			mediaType: "live",
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 1234,
		};
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 1234 },
		};

		try {
			expect(handleRequest(worker, data, pageContext, pageContext)).toBe(true);
			expect(recover).toHaveBeenCalledOnce();
			expect(
				handleRequest(
					worker,
					{ ...data, cycleStartedAt: 1233 },
					pageContext,
					pageContext,
				),
			).toBe(false);
			expect(
				handleRequest(worker, data, pageContext, {
					MediaType: "live",
					ChannelName: "otherchannel",
					MediaKey: "live:otherchannel",
				}),
			).toBe(false);
			expect(recover).toHaveBeenCalledOnce();
		} finally {
			g._recoverCrashedWorker = previousRecover;
		}
	});

	it("drops queued ad recovery work after the master toggle turns off", () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			IsAdStrippingEnabled: false,
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			PinnedBackupPlayerType: null,
			PinnedBackupPlayerChannel: null,
			PinnedBackupPlayerMediaKey: null,
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			LastAdEndedAt: 0,
			LastAdEndedChannel: null,
			LastAdEndedMediaKey: null,
			LastAdEndedCycleStartedAt: 0,
			AdCycleStaleMs: 120000,
		});
		const previousRecover = g._recoverCrashedWorker;
		const previousFatalRecovery = g._acceptFatalAdMediaRecoveryReady;
		const previousSuppress = g._suppressCompetingMediaDuringAd;
		const previousSchedule = g._schedulePlaybackRecoveryTimeout;
		const previousPlayerTask = g._doPlayerTask;
		const previousCycleCurrent = g._isCodecHandoffCycleCurrent;
		const recover = vi.fn();
		const fatalRecovery = vi.fn();
		const suppress = vi.fn();
		const schedule = vi.fn();
		const playerTask = vi.fn();
		const cycleCurrent = vi.fn(() => false);
		g._recoverCrashedWorker = recover;
		g._acceptFatalAdMediaRecoveryReady = fatalRecovery;
		g._suppressCompetingMediaDuringAd = suppress;
		g._schedulePlaybackRecoveryTimeout = schedule;
		g._doPlayerTask = playerTask;
		g._isCodecHandoffCycleCurrent = cycleCurrent;
		const harness = installWorkerMessageHarness();
		const initialMessageCount = harness.worker.messages.length;
		const context = {
			channel: "testchannel",
			mediaKey: "live:testchannel",
			pageChannel: "testchannel",
			pageMediaKey: "live:testchannel",
			cycleStartedAt: 1234,
		};

		try {
			for (const message of [
				{
					key: "MediaBootstrapRecoveryNeeded",
					mediaType: "live",
					...context,
				},
				{
					key: "AdDetected",
					detectedAt: 1234,
					playlistUrl:
						"https://video-weaver.example.ttvnw.net/v1/playlist/queued.m3u8",
					...context,
				},
				{ key: "AdPodProgress", adIds: ["stitched-ad-queued"], ...context },
				{ key: "BackupPlayerTypeSelected", value: "autoplay", ...context },
				{ key: "FatalMediaRecoveryReady", ...context },
				{ key: "PauseResumePlayer", ...context },
				{ key: "ReloadPlayer", reason: "ad-recovery", ...context },
			]) {
				harness.worker.emitMessage(message);
			}

			expect(state.CurrentAdChannel).toBeNull();
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(state.PinnedBackupPlayerType).toBeNull();
			expect(Object.keys(state.AdPodProgressByMediaKey as object)).toEqual([]);
			expect(harness.worker.messages).toHaveLength(initialMessageCount);
			expect(recover).not.toHaveBeenCalled();
			expect(fatalRecovery).not.toHaveBeenCalled();
			expect(suppress).not.toHaveBeenCalled();
			expect(schedule).not.toHaveBeenCalled();
			expect(playerTask).not.toHaveBeenCalled();
			expect(cycleCurrent).not.toHaveBeenCalled();

			harness.worker.emitMessage({
				key: "AdEnded",
				endedAt: 1235,
				...context,
			});
			expect(cycleCurrent).not.toHaveBeenCalled();
		} finally {
			harness.restore();
			g._recoverCrashedWorker = previousRecover;
			g._acceptFatalAdMediaRecoveryReady = previousFatalRecovery;
			g._suppressCompetingMediaDuringAd = previousSuppress;
			g._schedulePlaybackRecoveryTimeout = previousSchedule;
			g._doPlayerTask = previousPlayerTask;
			g._isCodecHandoffCycleCurrent = previousCycleCurrent;
		}
	});

	it("keeps recovery-critical messages from a crashed pip worker after navigation", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const previousPipMatch = g._isActivePictureInPicturePlaybackContext;
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => context.MediaKey === "live:testchannel";
		try {
			expect(
				canHandle(
					{ key: "NativePlaybackRestored" },
					{
						__TTVABPageMediaType: "live",
						__TTVABPageChannel: "testchannel",
						__TTVABPageMediaKey: "live:testchannel",
					},
					{ MediaType: "live", ChannelName: "testchannel" },
					{
						MediaType: "live",
						ChannelName: "otherchannel",
						MediaKey: "live:otherchannel",
					},
				),
			).toBe(true);
		} finally {
			g._isActivePictureInPicturePlaybackContext = previousPipMatch;
		}
	});

	it("does not fence predecessor messages on worker construction alone", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const worker: Record<string, unknown> = {
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 100,
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		const replacement = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 200,
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		(g._S as { workers: unknown[] }).workers = [replacement];
		const pageContext = { MediaType: "live", ChannelName: "testchannel" };
		const currentContext = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		expect(
			canHandle(
				{ key: "NativePlaybackRestored" },
				worker,
				pageContext,
				currentContext,
			),
		).toBe(true);
	});

	it("accepts additive recovery state only until the predecessor is retired", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const worker: Record<string, unknown> = {
			__TTVABGeneration: 1,
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		const pageContext = { MediaType: "live", ChannelName: "testchannel" };
		const currentContext = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const recoveryState = getRecoveryState(currentContext);
		recoveryState.activeEpoch = 1;
		recoveryState.failedGeneration = 1;
		recoveryState.retiredThroughGeneration = 0;
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			1,
		);

		for (const key of ["AdDetected", "AdPodProgress"]) {
			expect(canHandle({ key }, worker, pageContext, currentContext)).toBe(
				true,
			);
		}
		for (const key of [
			"AdBlocked",
			"AdSecondsBlocked",
			"AdEnded",
			"NativePlaybackRestored",
			"ReloadPlayer",
			"FatalMediaRecoveryReady",
		]) {
			expect(canHandle({ key }, worker, pageContext, currentContext)).toBe(
				true,
			);
		}

		recoveryState.activeEpoch = 0;
		recoveryState.retiredThroughGeneration = 1;
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			2,
		);
		(g._S as { workers: unknown[] }).workers = [];

		for (const key of [
			"AdDetected",
			"AdPodProgress",
			"AdBlocked",
			"AdSecondsBlocked",
			"AdEnded",
			"NativePlaybackRestored",
			"ReloadPlayer",
		]) {
			expect(canHandle({ key }, worker, pageContext, currentContext)).toBe(
				false,
			);
		}
	});

	it("lets a predecessor generation claim a genuinely newer ad cycle", () => {
		const claimControl = T<
			(
				mediaKey: string,
				cycleStartedAt: number,
				workerGeneration: number,
				eventAt: number,
			) => boolean
		>("_claimPageAdCycleControl");
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ cycleStartedAt: number; workerGeneration: number }
		>;

		expect(claimControl("live:testchannel", 100, 2, 1000)).toBe(true);
		expect(claimControl("live:testchannel", 200, 1, 2000)).toBe(true);
		expect(controls.get("live:testchannel")).toMatchObject({
			cycleStartedAt: 200,
			workerGeneration: 1,
		});
		expect(claimControl("live:testchannel", 200, 0, 2001)).toBe(false);
		expect(claimControl("live:testchannel", 200, 1, 1999)).toBe(false);
	});

	it("keeps provisional terminal authority fail closed without a healthy owner", () => {
		const claimControl = T<
			(
				mediaKey: string,
				cycleStartedAt: number,
				workerGeneration: number,
				eventAt: number,
			) => boolean
		>("_claimPageAdCycleControl");
		const reassignControl = T<
			(
				mediaKey: string,
				workerGeneration: number,
				worker: Record<string, unknown>,
				now: number,
			) => boolean
		>("_reassignPageAdCycleControlAfterWorkerRetirement");
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			1,
		);

		expect(claimControl("live:testchannel", 100, 2, 1000)).toBe(true);
		expect(
			reassignControl("live:testchannel", 2, { __TTVABGeneration: 2 }, 1001),
		).toBe(false);
		expect(controls.get("live:testchannel")).toMatchObject({
			workerGeneration: 2,
			latestEventAt: 1000,
		});
	});

	it("returns provisional terminal authority when an auxiliary worker terminates", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		Object.assign(playbackOwner as unknown as Record<string, unknown>, {
			__TTVABFirstPongAt: 1000,
			__TTVABLastPongAt: 1000,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 1000],
			]),
		});
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			1,
		);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			expect(
				T<
					(
						mediaKey: string,
						cycleStartedAt: number,
						workerGeneration: number,
						eventAt: number,
					) => boolean
				>("_claimPageAdCycleControl")("live:testchannel", 100, 2, 1000),
			).toBe(true);
			provisionalClaimant.terminate();
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 1,
				latestEventAt: 1000,
			});
		} finally {
			harness.restore();
		}
	});

	it("renews exact resume intent before clearing the active ad context", () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: "autoplay",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 190000 },
			},
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: 199000,
			AdCycleStaleMs: 120000,
		});
		const previousPendingIntent = g._hasPendingAdResumeIntent;
		const previousUserPause = g._hasUserPauseIntent;
		const previousSuppress = g._shouldSuppressAutomaticPlaybackResume;
		const activeAdAtIntentChecks: unknown[] = [];
		g._hasPendingAdResumeIntent = vi.fn(() => {
			activeAdAtIntentChecks.push(state.CurrentAdMediaKey);
			if (state.ShouldResumeAfterAd !== true) return false;
			state.ShouldResumeAfterAdUntil = Date.now() + 15000;
			return true;
		});
		g._hasUserPauseIntent = () => false;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		confirmHarnessWorkerPlayback(harness.worker);

		try {
			harness.worker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 190000,
				restoredAt: 200001,
				requiresReload: true,
				refreshAccessToken: false,
			});

			expect(activeAdAtIntentChecks[0]).toBe("live:testchannel");
			expect(state.ShouldResumeAfterAdUntil).toBe(215000);
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			harness.restore();
			g._hasPendingAdResumeIntent = previousPendingIntent;
			g._hasUserPauseIntent = previousUserPause;
			g._shouldSuppressAutomaticPlaybackResume = previousSuppress;
		}
	});

	it("re-arms a rapid same-cycle continuation and accepts its final restore", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			PinnedBackupPlayerType: null,
			PinnedBackupPlayerChannel: null,
			PinnedBackupPlayerMediaKey: null,
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			LastAdEndedAt: 100000,
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 90000,
			LastAdDetectedAt: 90000,
			LastAdRecoveryReloadAt: 100000,
			LastAdRecoveryResumeAt: 100000,
			AdCycleStaleMs: 120000,
		});
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const continuationWorker = harness.createWorker();
		const initialMessageCount = continuationWorker.messages.length;

		try {
			vi.setSystemTime(120000);
			continuationWorker.emitMessage({
				key: "AdDetected",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				continued: true,
				cycleStartedAt: 90000,
				detectedAt: 104843,
				playlistUrl:
					"https://video-weaver.example.ttvnw.net/v1/playlist/continued.m3u8",
			});

			expect(state.CurrentAdChannel).toBe("testchannel");
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(state.LastAdDetectedAt).toBe(120000);
			expect(state.LastAdRecoveryReloadAt).toBe(0);
			expect(state.LastAdRecoveryResumeAt).toBe(0);
			expect(
				(
					state.AdPodProgressByMediaKey as Record<
						string,
						{ cycleStartedAt: number }
					>
				)["live:testchannel"].cycleStartedAt,
			).toBe(90000);
			const continuationMessages = continuationWorker.messages
				.slice(initialMessageCount)
				.map((message) =>
					T<(value: unknown) => Record<string, unknown> | null>(
						"_getWorkerBridgeMessage",
					)(message),
				);
			expect(continuationMessages).toContainEqual(
				expect.objectContaining({ key: "UpdateCurrentAdContext" }),
			);
			expect(continuationMessages).toContainEqual(
				expect.objectContaining({ key: "UpdateAdPodProgress" }),
			);
			expect(continuationMessages).not.toContainEqual(
				expect.objectContaining({ key: "ClearAdPodProgress" }),
			);

			continuationWorker.emitMessage({
				key: "BackupPlayerTypeSelected",
				value: "autoplay",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			});
			expect(state.PinnedBackupPlayerType).toBe("autoplay");

			vi.setSystemTime(120001);
			continuationWorker.emitMessage({
				key: "AdEnded",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				endedAt: 120001,
				holdingBackup: true,
			});
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(state.PinnedBackupPlayerType).toBe("autoplay");

			vi.setSystemTime(120002);
			harness.worker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 120002,
				requiresReload: true,
			});
			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");

			continuationWorker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 120000,
				requiresReload: true,
			});
			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");

			vi.setSystemTime(270000);
			continuationWorker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 89999,
				restoredAt: 270000,
				requiresReload: true,
				refreshAccessToken: false,
			});
			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");

			continuationWorker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 270000,
				requiresReload: true,
				refreshAccessToken: false,
			});
			expect(playerTask).toHaveBeenCalledOnce();
			expect(playerTask).toHaveBeenCalledWith(false, true, {
				reason: "post-ad-native-restore",
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			});
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(state.PinnedBackupPlayerType).toBeNull();
			expect(
				(state.AdPodProgressByMediaKey as Record<string, unknown>)[
					"live:testchannel"
				],
			).toBeUndefined();
		} finally {
			harness.restore();
		}
	});

	it("rebuilds native playback after an exact pinned-backup timeline realignment", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100001);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: "site",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 90000 },
			},
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			AdCycleStaleMs: 120000,
		});
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const previousConsumeTimelineRestore =
			g._consumePinnedBackupTimelineRestore;
		let timelineRestorePending = true;
		const consumeTimelineRestore = vi.fn(() => {
			const shouldReload = timelineRestorePending;
			timelineRestorePending = false;
			return shouldReload;
		});
		g._consumePinnedBackupTimelineRestore = consumeTimelineRestore;
		const harness = installWorkerMessageHarness();

		try {
			harness.worker.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 100001,
				requiresReload: true,
				refreshAccessToken: false,
			});

			expect(playerTask).toHaveBeenCalledOnce();
			expect(playerTask).toHaveBeenCalledWith(false, true, {
				reason: "post-ad-native-restore",
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			});
			expect(consumeTimelineRestore).toHaveBeenCalledOnce();
			expect(consumeTimelineRestore).toHaveBeenCalledWith(
				"live:testchannel",
				90000,
			);
			expect(timelineRestorePending).toBe(false);
		} finally {
			harness.restore();
			g._consumePinnedBackupTimelineRestore = previousConsumeTimelineRestore;
		}
	});

	it.each([
		["an omitted token policy", undefined, true],
		["an explicit token refresh", true, true],
		["an exact-session token policy", false, false],
	])("applies %s to the accepted native rebuild", (_label, value, expected) => {
		vi.useFakeTimers();
		vi.setSystemTime(100001);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: "autoplay",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 90000 },
			},
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			AdCycleStaleMs: 120000,
		});
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();

		try {
			const message: Record<string, unknown> = {
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 100001,
				requiresReload: true,
			};
			if (value !== undefined) {
				message.refreshAccessToken = value;
			}
			harness.worker.emitMessage(message);

			expect(playerTask).toHaveBeenCalledOnce();
			expect(playerTask).toHaveBeenCalledWith(false, true, {
				reason: "post-ad-native-restore",
				refreshAccessToken: expected,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			});
		} finally {
			harness.restore();
		}
	});

	it.each([
		{
			name: "reload returns false",
			requiresReload: true,
			firstAttempt: () => false,
			expectedPausePlay: false,
			expectedReload: true,
			expectedOptions: {
				reason: "post-ad-native-restore",
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			},
		},
		{
			name: "pause resume throws",
			requiresReload: false,
			firstAttempt: () => {
				throw new Error("player remount in progress");
			},
			expectedPausePlay: true,
			expectedReload: false,
			expectedOptions: {
				reason: "post-ad-native-restore",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 90000,
			},
		},
	])(
		"retries the native restore action when $name",
		async ({
			requiresReload,
			firstAttempt,
			expectedPausePlay,
			expectedReload,
			expectedOptions,
		}) => {
			vi.useFakeTimers();
			vi.setSystemTime(100000);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			Object.assign(state, {
				PageMediaType: "live",
				PageChannel: "testchannel",
				PageVodID: null,
				PageMediaKey: "live:testchannel",
				CurrentAdChannel: "testchannel",
				CurrentAdMediaKey: "live:testchannel",
				PinnedBackupPlayerType: "autoplay",
				PinnedBackupPlayerChannel: "testchannel",
				PinnedBackupPlayerMediaKey: "live:testchannel",
				ActiveCodecHandoffId: null,
				ActiveCodecHandoffChannel: null,
				ActiveCodecHandoffMediaKey: null,
				AdPodProgressByMediaKey: {
					"live:testchannel": { cycleStartedAt: 90000 },
				},
				StreamInfos: Object.create(null),
				StreamInfosByUrl: Object.create(null),
				AdCycleStaleMs: 120000,
			});
			const playerTask = vi
				.fn()
				.mockImplementationOnce(firstAttempt)
				.mockReturnValue(true);
			g._doPlayerTask = playerTask;
			const scheduleRecovery = installCycleFencedRecoveryScheduler();
			const harness = installWorkerMessageHarness();

			try {
				vi.setSystemTime(100001);
				harness.worker.emitMessage({
					key: "NativePlaybackRestored",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					pageChannel: "testchannel",
					pageMediaKey: "live:testchannel",
					cycleStartedAt: 90000,
					restoredAt: 100001,
					requiresReload,
					refreshAccessToken: false,
				});
				expect(playerTask).toHaveBeenCalledOnce();
				expect(playerTask).toHaveBeenLastCalledWith(
					expectedPausePlay,
					expectedReload,
					expectedOptions,
				);
				expect(scheduleRecovery).toHaveBeenCalledWith(
					expect.any(Function),
					80,
					"testchannel",
					"live:testchannel",
					90000,
				);

				await vi.advanceTimersByTimeAsync(80);
				expect(playerTask).toHaveBeenCalledTimes(2);
				expect(playerTask).toHaveBeenLastCalledWith(
					expectedPausePlay,
					expectedReload,
					expectedOptions,
				);
			} finally {
				harness.restore();
			}
		},
	);

	it("keeps post-ad recovery armed while an ordinary reload waits for the player", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: "site",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 90000 },
			},
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: 115000,
			AdCycleStaleMs: 120000,
			_AdRecoveryConsecutiveFailures: 0,
		});
		const playerTask = vi
			.fn()
			.mockReturnValueOnce(undefined)
			.mockReturnValue(true);
		g._doPlayerTask = playerTask;
		const scheduleRecovery = installCycleFencedRecoveryScheduler();
		const harness = installWorkerMessageHarness();

		try {
			vi.setSystemTime(100001);
			harness.worker.emitMessage({
				key: "AdEnded",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				endedAt: 100001,
				willReload: true,
				holdingBackup: false,
			});
			expect(state.ShouldResumeAfterAd).toBe(true);

			harness.worker.emitMessage({
				key: "ReloadPlayer",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				reason: "post-ad",
				refreshAccessToken: true,
				newMediaPlayerInstance: false,
			});
			expect(playerTask).toHaveBeenCalledOnce();
			expect(state.ShouldResumeAfterAd).toBe(true);
			expect(scheduleRecovery).toHaveBeenCalledWith(
				expect.any(Function),
				80,
				"testchannel",
				"live:testchannel",
				90000,
			);

			await vi.advanceTimersByTimeAsync(80);
			expect(playerTask).toHaveBeenCalledTimes(2);
			expect(playerTask).toHaveBeenLastCalledWith(false, true, {
				reason: "post-ad",
				handoffId: null,
				cycleStartedAt: 90000,
				refreshAccessToken: true,
				newMediaPlayerInstance: false,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			});
			await vi.advanceTimersByTimeAsync(1000);
			expect(playerTask).toHaveBeenCalledTimes(2);
			expect(state.ShouldResumeAfterAd).toBe(true);
		} finally {
			harness.restore();
		}
	});

	it("retries a rejected post-ad pause resume without dropping playback intent", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: null,
			PinnedBackupPlayerChannel: null,
			PinnedBackupPlayerMediaKey: null,
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 190000 },
			},
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: 215000,
			AdCycleStaleMs: 120000,
			_AdRecoveryConsecutiveFailures: 0,
		});
		const playerTask = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
		g._doPlayerTask = playerTask;
		const scheduleRecovery = installCycleFencedRecoveryScheduler();
		const harness = installWorkerMessageHarness();

		try {
			vi.setSystemTime(200001);
			harness.worker.emitMessage({
				key: "AdEnded",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 190000,
				endedAt: 200001,
				willReload: false,
				holdingBackup: false,
			});
			harness.worker.emitMessage({
				key: "PauseResumePlayer",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 190000,
			});
			expect(playerTask).toHaveBeenCalledOnce();
			expect(state.ShouldResumeAfterAd).toBe(true);
			expect(scheduleRecovery).toHaveBeenCalledWith(
				expect.any(Function),
				80,
				"testchannel",
				"live:testchannel",
				190000,
			);

			await vi.advanceTimersByTimeAsync(80);
			expect(playerTask).toHaveBeenCalledTimes(2);
			expect(playerTask).toHaveBeenLastCalledWith(true, false, {
				reason: "ad-recovery",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 190000,
			});
			expect(state.ShouldResumeAfterAd).toBe(true);
		} finally {
			harness.restore();
		}
	});

	it("does not start a post-ad task after explicit user pause", () => {
		const previousPlayerTask = g._doPlayerTask;
		const previousPendingIntent = g._hasPendingAdResumeIntent;
		const previousUserPause = g._hasUserPauseIntent;
		const previousSuppress = g._shouldSuppressAutomaticPlaybackResume;
		const previousSchedule = g._schedulePlaybackRecoveryTimeout;
		const playerTask = vi.fn(() => true);
		const schedule = vi.fn();
		g._doPlayerTask = playerTask;
		g._hasPendingAdResumeIntent = () => true;
		g._hasUserPauseIntent = () => true;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._schedulePlaybackRecoveryTimeout = schedule;

		try {
			expect(
				T<
					(
						isPausePlay: boolean,
						isReload: boolean,
						options: Record<string, unknown>,
					) => boolean
				>("_runPostAdPlayerTask")(false, true, {
					reason: "post-ad-native-restore",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					cycleStartedAt: 90000,
				}),
			).toBe(false);
			expect(playerTask).not.toHaveBeenCalled();
			expect(schedule).not.toHaveBeenCalled();
		} finally {
			g._doPlayerTask = previousPlayerTask;
			g._hasPendingAdResumeIntent = previousPendingIntent;
			g._hasUserPauseIntent = previousUserPause;
			g._shouldSuppressAutomaticPlaybackResume = previousSuppress;
			g._schedulePlaybackRecoveryTimeout = previousSchedule;
		}
	});

	it.each(["resume intent completed", "user paused"])(
		"drops a queued post-ad retry when %s",
		async (reason) => {
			vi.useFakeTimers();
			const previousPlayerTask = g._doPlayerTask;
			const previousPendingIntent = g._hasPendingAdResumeIntent;
			const previousUserPause = g._hasUserPauseIntent;
			const previousSuppress = g._shouldSuppressAutomaticPlaybackResume;
			const previousSchedule = g._schedulePlaybackRecoveryTimeout;
			let pendingIntent = true;
			let userPaused = false;
			const playerTask = vi.fn(() => false);
			g._doPlayerTask = playerTask;
			g._hasPendingAdResumeIntent = () => pendingIntent;
			g._hasUserPauseIntent = () => userPaused;
			g._shouldSuppressAutomaticPlaybackResume = () => false;
			g._schedulePlaybackRecoveryTimeout = (
				callback: () => void,
				delay: number,
			) => setTimeout(callback, delay);

			try {
				T<
					(
						isPausePlay: boolean,
						isReload: boolean,
						options: Record<string, unknown>,
					) => boolean
				>("_runPostAdPlayerTask")(false, true, {
					reason: "post-ad-native-restore",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					cycleStartedAt: 90000,
				});
				expect(playerTask).toHaveBeenCalledOnce();

				if (reason === "user paused") {
					userPaused = true;
				} else {
					pendingIntent = false;
				}
				await vi.advanceTimersByTimeAsync(80);
				expect(playerTask).toHaveBeenCalledOnce();
			} finally {
				g._doPlayerTask = previousPlayerTask;
				g._hasPendingAdResumeIntent = previousPendingIntent;
				g._hasUserPauseIntent = previousUserPause;
				g._shouldSuppressAutomaticPlaybackResume = previousSuppress;
				g._schedulePlaybackRecoveryTimeout = previousSchedule;
			}
		},
	);

	it("drops a queued ordinary recovery retry when the ad cycle changes", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			LastAdEndedAt: 300000,
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 290000,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
		});
		const playerTask = vi.fn(() => false);
		g._doPlayerTask = playerTask;
		const scheduleRecovery = installCycleFencedRecoveryScheduler();
		const harness = installWorkerMessageHarness();

		try {
			harness.worker.emitMessage({
				key: "ReloadPlayer",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 290000,
				reason: "post-ad",
			});
			expect(playerTask).toHaveBeenCalledOnce();
			expect(scheduleRecovery).toHaveBeenCalledWith(
				expect.any(Function),
				80,
				"testchannel",
				"live:testchannel",
				290000,
			);

			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 300001 },
			};
			await vi.advanceTimersByTimeAsync(1000);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			harness.restore();
		}
	});

	it("returns provisional terminal authority to the confirmed playback owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			PinnedBackupPlayerType: null,
			PinnedBackupPlayerChannel: null,
			PinnedBackupPlayerMediaKey: null,
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			LastAdEndedAt: 100000,
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 90000,
			AdCycleStaleMs: 120000,
		});
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{
				cycleStartedAt: number;
				workerGeneration: number;
				latestEventAt: number;
			}
		>;

		try {
			vi.setSystemTime(104843);
			provisionalClaimant.emitMessage({
				key: "AdDetected",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				continued: true,
				cycleStartedAt: 90000,
				detectedAt: 104843,
				playlistUrl:
					"https://video-weaver.example.ttvnw.net/v1/playlist/provisional.m3u8",
			});
			expect(controls.get("live:testchannel")).toMatchObject({
				cycleStartedAt: 90000,
				workerGeneration: 2,
				latestEventAt: 104843,
			});

			vi.setSystemTime(104844);
			playbackOwner.emitMessage({
				key: "AdEnded",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				endedAt: 104844,
				holdingBackup: true,
			});
			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				cycleStartedAt: 90000,
				workerGeneration: 1,
				latestEventAt: 104844,
			});

			vi.setSystemTime(104845);
			provisionalClaimant.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 104845,
				requiresReload: true,
			});
			expect(playerTask).not.toHaveBeenCalled();
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 1,
				latestEventAt: 104844,
			});

			vi.setSystemTime(104846);
			playbackOwner.emitMessage({
				key: "NativePlaybackRestored",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				cycleStartedAt: 90000,
				restoredAt: 104846,
				requiresReload: true,
			});
			expect(playerTask).toHaveBeenCalledOnce();
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 1,
				latestEventAt: 104846,
			});
		} finally {
			harness.restore();
		}
	});

	it("rejects terminal reclaim from a confirmed owner with stale playback evidence", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const state = setProvisionalTerminalState(116000);
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			vi.setSystemTime(116000);
			emitHarnessWorkerPong(playbackOwner);
			vi.setSystemTime(116001);
			emitProvisionalContinuation(provisionalClaimant, 116001);
			vi.setSystemTime(116002);
			emitNativePlaybackRestored(playbackOwner, 116002);

			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 2,
				latestEventAt: 116001,
			});
		} finally {
			harness.restore();
		}
	});

	it("rejects terminal reclaim from a crashed confirmed owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const state = setProvisionalTerminalState(200000);
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			vi.setSystemTime(204843);
			emitProvisionalContinuation(provisionalClaimant, 204843);
			(playbackOwner as unknown as Record<string, unknown>).__TTVABCrashed =
				true;
			vi.setSystemTime(204844);
			emitNativePlaybackRestored(playbackOwner, 204844);

			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 2,
				latestEventAt: 204843,
			});
		} finally {
			harness.restore();
		}
	});

	it("rejects a tracked lookalike with the confirmed owner generation", () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const state = setProvisionalTerminalState(300000);
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		const lookalike = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		(lookalike as unknown as Record<string, unknown>).__TTVABGeneration = 1;
		confirmHarnessWorkerPlayback(
			lookalike,
			"https://video-weaver.example.ttvnw.net/v1/playlist/lookalike.m3u8",
		);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			vi.setSystemTime(304843);
			emitProvisionalContinuation(provisionalClaimant, 304843);
			vi.setSystemTime(304844);
			emitNativePlaybackRestored(lookalike, 304844);

			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 2,
				latestEventAt: 304843,
			});
		} finally {
			harness.restore();
		}
	});

	it("rejects terminal reclaim from an explicitly retired confirmed owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(400000);
		const state = setProvisionalTerminalState(400000);
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")({ MediaKey: "live:testchannel" });
		recoveryState.retiredThroughGeneration = 1;
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			vi.setSystemTime(404843);
			emitProvisionalContinuation(provisionalClaimant, 404843);
			vi.setSystemTime(404844);
			emitNativePlaybackRestored(playbackOwner, 404844);

			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 2,
				latestEventAt: 404843,
			});
		} finally {
			harness.restore();
		}
	});

	it("does not supersede a newer confirmed playback owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(500000);
		const state = setProvisionalTerminalState(500000);
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const harness = installWorkerMessageHarness();
		const playbackOwner = harness.worker;
		const provisionalClaimant = harness.createWorker();
		confirmHarnessWorkerPlayback(playbackOwner);
		const controls = g._pageAdCycleControlByMediaKey as Map<
			string,
			{ workerGeneration: number; latestEventAt: number }
		>;

		try {
			vi.setSystemTime(504843);
			emitProvisionalContinuation(provisionalClaimant, 504843);
			confirmHarnessWorkerPlayback(
				provisionalClaimant,
				"https://video-weaver.example.ttvnw.net/v1/playlist/new-owner.m3u8",
			);
			vi.setSystemTime(504844);
			emitNativePlaybackRestored(playbackOwner, 504844);

			expect(playerTask).not.toHaveBeenCalled();
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(controls.get("live:testchannel")).toMatchObject({
				workerGeneration: 2,
				latestEventAt: 504843,
			});
		} finally {
			harness.restore();
		}
	});

	it("rejects stale or conflicting rapid continuation claims", () => {
		vi.useFakeTimers();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			StreamInfos: Object.create(null),
			StreamInfosByUrl: Object.create(null),
			AdCycleStaleMs: 120000,
		});
		const harness = installWorkerMessageHarness();
		const cases = [
			{ continued: false, now: 104843 },
			{ continued: true, now: 108001 },
			{ continued: true, now: 104843, lastEndedAt: 104844 },
			{ continued: true, now: 104843, detectedAt: 104844 },
			{ continued: true, now: 104843, detectedAt: 0 },
			{ continued: true, now: 104843, cycleStartedAt: 89999 },
			{ continued: true, now: 104843, activeCycleStartedAt: 80000 },
			{ continued: true, now: 104843, activeCycleStartedAt: 91000 },
		];

		try {
			for (const testCase of cases) {
				vi.setSystemTime(testCase.now);
				Object.assign(state, {
					CurrentAdChannel: null,
					CurrentAdMediaKey: null,
					AdPodProgressByMediaKey:
						testCase.activeCycleStartedAt === undefined
							? Object.create(null)
							: {
									"live:testchannel": {
										cycleStartedAt: testCase.activeCycleStartedAt,
									},
								},
					LastAdEndedAt: testCase.lastEndedAt ?? 100000,
					LastAdEndedChannel: "testchannel",
					LastAdEndedMediaKey: "live:testchannel",
					LastAdEndedCycleStartedAt: 90000,
				});
				harness.worker.emitMessage({
					key: "AdDetected",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					pageChannel: "testchannel",
					pageMediaKey: "live:testchannel",
					continued: testCase.continued,
					cycleStartedAt: testCase.cycleStartedAt ?? 90000,
					detectedAt: testCase.detectedAt ?? testCase.now,
					playlistUrl:
						"https://video-weaver.example.ttvnw.net/v1/playlist/stale.m3u8",
				});
				expect(state.CurrentAdMediaKey).toBeNull();
			}

			Object.assign(state, {
				CurrentAdChannel: null,
				CurrentAdMediaKey: null,
				AdPodProgressByMediaKey: Object.create(null),
				LastAdEndedAt: 100000,
				LastAdEndedChannel: "testchannel",
				LastAdEndedMediaKey: "live:testchannel",
				LastAdEndedCycleStartedAt: 90000,
			});
			vi.setSystemTime(104843);
			(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
				"live:testchannel",
				2,
			);
			harness.worker.emitMessage({
				key: "AdDetected",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				pageChannel: "testchannel",
				pageMediaKey: "live:testchannel",
				continued: true,
				cycleStartedAt: 90000,
				detectedAt: 104843,
				playlistUrl:
					"https://video-weaver.example.ttvnw.net/v1/playlist/retired.m3u8",
			});
			expect(state.CurrentAdMediaKey).toBeNull();
		} finally {
			harness.restore();
		}
	});

	it("resets only the exact completed worker ad cycle", () => {
		const resetCycle = T<(value: Record<string, unknown>) => boolean>(
			"_resetWorkerAdCycleState",
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = {
			MediaKey: "live:testchannel",
			VisibleAdStartedAt: 1000,
			IsShowingAd: true,
			IsHoldingBackupAfterAd: true,
			RequestedAds: new Set<string>(),
			SpoofedAdIds: new Set<string>(),
			RecentSpoofedAdIds: new Map<string, number>(),
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			FailedBackupPlayerTypes: new Set<string>(),
			_BackupSearchPromises: new Map<string, Promise<unknown>>(),
			BackupPlaylistMetadata: new Map<string, unknown>(),
		};
		Object.assign(state, {
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: "embed",
			PinnedBackupPlayerChannel: "testchannel",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 1000 },
			},
			StreamInfos: { "live:testchannel": info },
		});

		expect(
			resetCycle({ mediaKey: "live:testchannel", cycleStartedAt: 1000 }),
		).toBe(true);
		expect(info.IsShowingAd).toBe(false);
		expect(info.IsHoldingBackupAfterAd).toBe(false);
		expect(state.CurrentAdMediaKey).toBeNull();
		expect(state.PinnedBackupPlayerType).toBeNull();
		expect(
			(state.AdPodProgressByMediaKey as Record<string, unknown>)[
				"live:testchannel"
			],
		).toBeUndefined();
	});

	it("does not let a delayed cycle reset clear a newer worker ad cycle", () => {
		const resetCycle = T<(value: Record<string, unknown>) => boolean>(
			"_resetWorkerAdCycleState",
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = {
			MediaKey: "live:testchannel",
			VisibleAdStartedAt: 2000,
			IsShowingAd: true,
		};
		Object.assign(state, {
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 2000 },
			},
			StreamInfos: { "live:testchannel": info },
		});

		expect(
			resetCycle({ mediaKey: "live:testchannel", cycleStartedAt: 1000 }),
		).toBe(false);
		expect(info.IsShowingAd).toBe(true);
		expect(state.CurrentAdMediaKey).toBe("live:testchannel");
		expect(
			(
				state.AdPodProgressByMediaKey as Record<
					string,
					{ cycleStartedAt: number }
				>
			)["live:testchannel"].cycleStartedAt,
		).toBe(2000);
	});

	it("clears an older same-stream worker hold when a later cycle completes", () => {
		const resetCycle = T<(value: Record<string, unknown>) => boolean>(
			"_resetWorkerAdCycleState",
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = {
			MediaKey: "live:testchannel",
			VisibleAdStartedAt: 1000,
			IsShowingAd: true,
			IsHoldingBackupAfterAd: true,
			RequestedAds: new Set<string>(),
			SpoofedAdIds: new Set<string>(),
			RecentSpoofedAdIds: new Map<string, number>(),
			ObservedAdPodIds: new Set<string>(),
			FailedBackupPlayerTypes: new Set<string>(),
			_BackupSearchPromises: new Map<string, Promise<unknown>>(),
			BackupPlaylistMetadata: new Map<string, unknown>(),
		};
		Object.assign(state, {
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 2000 },
			},
			StreamInfos: { "live:testchannel": info },
		});

		expect(
			resetCycle({ mediaKey: "live:testchannel", cycleStartedAt: 2000 }),
		).toBe(true);
		expect(info.IsShowingAd).toBe(false);
		expect(info.IsHoldingBackupAfterAd).toBe(false);
		expect(info.VisibleAdStartedAt).toBe(0);
		expect(state.CurrentAdMediaKey).toBeNull();
	});

	it("retires terminal cycle events and broadcasts a cycle-fenced worker reset", () => {
		const complete = T<(mediaKey: string) => boolean>(
			"_completePageSideFallbackAdRecovery",
		);
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")(context);
		recoveryState.phase = "exhausted";
		recoveryState.failedGeneration = 1;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 1000 },
			},
			StreamInfos: Object.create(null),
		});
		const previousBroadcast = g._broadcastWorkers;
		const previousCleanup = g._schedulePostAdArtifactCleanup;
		const broadcast = vi.fn();
		g._broadcastWorkers = broadcast;
		g._schedulePostAdArtifactCleanup = vi.fn();

		try {
			expect(complete("live:testchannel")).toBe(true);
			expect(recoveryState.retiredThroughGeneration).toBe(1);
			expect(broadcast).toHaveBeenCalledOnce();
			expect(broadcast.mock.calls[0][0]).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						key: "ResetAdCycleState",
						targetMediaKey: "live:testchannel",
						value: expect.objectContaining({ cycleStartedAt: 1000 }),
					}),
				]),
			);
			const failedWorker = {
				__TTVABGeneration: 1,
				__TTVABPageMediaKey: "live:testchannel",
			};
			for (const key of ["ReloadPlayer", "PauseResumePlayer"]) {
				expect(canHandle({ key }, failedWorker, context, context)).toBe(false);
			}
		} finally {
			g._broadcastWorkers = previousBroadcast;
			g._schedulePostAdArtifactCleanup = previousCleanup;
		}
	});

	it("fences every live predecessor message after a newer owner is promoted", () => {
		const isRetired = T<
			(
				worker: Record<string, unknown>,
				context?: Record<string, unknown>,
			) => boolean
		>("_isWorkerGenerationRetired");
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			2,
		);

		expect(
			isRetired({
				__TTVABGeneration: 1,
				__TTVABPageMediaKey: "live:testchannel",
			}),
		).toBe(true);
		expect(
			isRetired({
				__TTVABGeneration: 2,
				__TTVABPageMediaKey: "live:testchannel",
			}),
		).toBe(false);
	});

	it("requires exact post-crash playlist ownership and a healthy heartbeat", () => {
		const getReplacement = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				boundaryAt: number,
				minimumGeneration: number,
				now?: number,
			) => Record<string, unknown> | null
		>("_getQualifiedReplacementWorker");
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const predecessor = {
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};
		const baseCandidate = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 1050,
			__TTVABFirstPongAt: 1100,
			__TTVABLastPongAt: 1100,
			__TTVABPageMediaKey: "live:testchannel",
		};
		const pongOnly = { ...baseCandidate };
		const observationOnly = {
			...baseCandidate,
			__TTVABFirstPongAt: 0,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 1100],
			]),
		};
		const wrongMedia = {
			...baseCandidate,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:otherchannel", 1100],
			]),
		};
		const preCrash = {
			...baseCandidate,
			__TTVABCreatedAt: 900,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 1100],
			]),
		};
		const qualified = {
			...baseCandidate,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 1100],
			]),
		};

		(g._S as { workers: unknown[] }).workers = [
			pongOnly,
			observationOnly,
			wrongMedia,
			preCrash,
		];
		expect(getReplacement(predecessor, context, 1000, 1, 1200)).toBeNull();

		(g._S as { workers: unknown[] }).workers.push(qualified);
		expect(getReplacement(predecessor, context, 1000, 1, 1200)).toBe(qualified);
	});

	it("uses one fixed bootstrap deadline for all starting replacements", () => {
		const hasStartingReplacement = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				minimumGeneration: number,
				bootstrapDeadlineAt: number,
				now?: number,
			) => boolean
		>("_hasStartingReplacementWorker");
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const predecessor = {
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};
		(g._S as { workers: unknown[] }).workers = [
			{
				__TTVABGeneration: 2,
				__TTVABCreatedAt: 114999,
				__TTVABPageMediaKey: "live:testchannel",
			},
		];

		expect(
			hasStartingReplacement(predecessor, context, 1, 115000, 114999),
		).toBe(true);
		(g._S as { workers: unknown[] }).workers.push({
			__TTVABGeneration: 3,
			__TTVABCreatedAt: 115000,
			__TTVABPageMediaKey: "live:testchannel",
		});
		expect(
			hasStartingReplacement(predecessor, context, 1, 115000, 115000),
		).toBe(false);
	});

	it("installs fallback and schedules recovery for an instant crash", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		let installedFallback = 0;
		let reloads = 0;
		g._installPageSideM3U8Override = () => {
			installedFallback++;
		};
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = () => {
			reloads++;
			recordTestPlayerReload("live:testchannel");
			return true;
		};

		try {
			const worker: Record<string, unknown> = {};
			const didRecover = recover(
				worker,
				{ MediaType: "live", ChannelName: "testchannel" },
				"Worker crashed: boom",
				"error",
			);

			expect(didRecover).toBe(true);
			expect(worker.__TTVABCrashed).toBe(true);
			expect(installedFallback).toBe(1);
			expect(reloads).toBe(0);

			vi.advanceTimersByTime(1000);
			expect(reloads).toBe(1);
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("never reloads a later stream for a worker with no playback context", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => true);
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;

		try {
			expect(recover({}, {}, "Unknown worker crashed")).toBe(true);
			window.history.replaceState(null, "", "/otherchannel");
			vi.advanceTimersByTime(60000);
			expect(installFallback).toHaveBeenCalledOnce();
			expect(playerTask).not.toHaveBeenCalled();
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("retries replacement worker recovery after reload cooldown instead of dropping it", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const attempt = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => void
		>("_attemptWorkerRestart");
		const reloads: unknown[][] = [];
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		}).lastReloadAt = 100000;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = (...args: unknown[]) => {
			reloads.push(args);
			recordTestPlayerReload("live:testchannel");
			return true;
		};

		try {
			attempt({}, { MediaType: "live", ChannelName: "testchannel" });
			vi.advanceTimersByTime(1000);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(28999);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(1);
			expect(reloads).toHaveLength(1);
			expect(reloads[0][2]).toEqual({
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			});
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("does not apply one playback context's reload cooldown to another", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({ MediaKey: "live:first" }).lastReloadAt = 100000;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "second",
			MediaKey: "live:second",
		});
		const playerTask = vi.fn(() => {
			recordTestPlayerReload("live:second");
			return true;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{},
				{
					MediaType: "live",
					ChannelName: "second",
					MediaKey: "live:second",
				},
			);
			vi.advanceTimersByTime(1000);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it.each(["false", "undefined", "throw"] as const)(
		"retries when player recovery returns %s before succeeding",
		(outcome) => {
			vi.useFakeTimers();
			vi.setSystemTime(100000);
			const attempt = T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart");
			const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			g._getPlaybackContextFromUrl = () => ({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			const playerTask = vi.fn((): boolean | undefined => {
				recordTestPlayerReload("live:testchannel");
				return true;
			});
			playerTask.mockImplementationOnce(() => {
				if (outcome === "throw") throw new Error("player unavailable");
				if (outcome === "undefined") return undefined;
				return false;
			});
			g._doPlayerTask = playerTask;

			try {
				attempt(
					{
						__TTVABCrashed: true,
						__TTVABGeneration: 1,
						__TTVABPageMediaKey: "live:testchannel",
					},
					{ MediaType: "live", ChannelName: "testchannel" },
				);
				vi.advanceTimersByTime(2999);
				expect(playerTask).toHaveBeenCalledOnce();
				expect(recoveryState.lastReloadAt).toBe(0);

				vi.advanceTimersByTime(1);
				expect(playerTask).toHaveBeenCalledTimes(2);
				expect(recoveryState.lastReloadAt).toBe(103000);
			} finally {
				if (previousGetPlaybackContext === undefined) {
					delete g._getPlaybackContextFromUrl;
				} else {
					g._getPlaybackContextFromUrl = previousGetPlaybackContext;
				}
			}
		},
	);

	it("keeps retrying a crashed worker after Twitch terminates its old instance", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => {
			recordTestPlayerReload("live:testchannel");
			return true;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABIntentionallyTerminated: true,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(1000);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("accepts a qualified automatic replacement without reloading", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => false);
		g._doPlayerTask = playerTask;
		const replacement = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 99900,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [replacement];

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABCreatedAt: 100,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(1000);
			expect(playerTask).not.toHaveBeenCalled();
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")({
				MediaType: "live",
				ChannelName: "testchannel",
			});
			expect(recoveryState.phase).toBe("stabilizing");
			expect(recoveryState.stableGeneration).toBe(2);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("does not recover a superseded worker while a newer owner stays healthy", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => false);
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const playbackWorker = {
			__TTVABGeneration: 2,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 99000],
			]),
		};
		const supersededWorker = {
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 90000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 95000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [
			supersededWorker,
			playbackWorker,
		];

		try {
			expect(
				recover(
					supersededWorker,
					{ MediaType: "live", ChannelName: "testchannel" },
					"Auxiliary worker crashed",
				),
			).toBe(true);
			vi.advanceTimersByTime(30000);
			expect(installFallback).not.toHaveBeenCalled();
			expect(playerTask).not.toHaveBeenCalled();
			expect((g._S as { workers: unknown[] }).workers).toEqual([
				playbackWorker,
			]);
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("requires a fresh playlist observation before ignoring another worker crash", () => {
		const getHealthyOwner = T<
			(
				context: Record<string, unknown>,
				excludedWorker?: Record<string, unknown> | null,
				now?: number,
				observedAfter?: number,
				requireFreshObservation?: boolean,
			) => Record<string, unknown> | null
		>("_getHealthyObservedPlaybackWorker");
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const owner = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 98000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [owner];

		expect(getHealthyOwner(context, null, 100000, 99000)).toBeNull();
		owner.__TTVABLastPongAt = 200000;
		expect(getHealthyOwner(context, null, 200000, 0, false)).toBe(owner);
		owner.__TTVABLastPongAt = 100000;
		owner.__TTVABPlaybackObservedAtByMediaKey.set("live:testchannel", 100000);
		expect(getHealthyOwner(context, null, 100000, 99000)).toBe(owner);
	});

	it("selects the newest healthy exact owner instead of creation order", () => {
		const getHealthyOwner = T<
			(
				context: Record<string, unknown>,
				excludedWorker?: Record<string, unknown> | null,
				now?: number,
				observedAfter?: number,
				requireFreshObservation?: boolean,
			) => Record<string, unknown> | null
		>("_getHealthyObservedPlaybackWorker");
		const context = {
			MediaType: "vod",
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
		};
		const olderOwner = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 200000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["vod:2827992810", 100000],
			]),
		};
		const newerOwner = {
			...olderOwner,
			__TTVABGeneration: 3,
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["vod:2827992810", 110000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [olderOwner, newerOwner];

		expect(getHealthyOwner(context, null, 200000, 0, false)).toBe(newerOwner);
	});

	it("ignores an unobserved auxiliary crash while a paused VOD owner is healthy", () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => false);
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const owner = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 200000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["vod:2827992810", 100000],
			]),
		};
		const auxiliary = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 199000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
		};
		(g._S as { workers: unknown[] }).workers = [owner, auxiliary];

		try {
			expect(recover(auxiliary, {}, "Auxiliary VOD worker crashed")).toBe(true);
			vi.advanceTimersByTime(60000);
			expect(installFallback).not.toHaveBeenCalled();
			expect(playerTask).not.toHaveBeenCalled();
			expect((g._S as { workers: unknown[] }).workers).toEqual([owner]);
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("recovers a newer bootstrapped VOD worker instead of trusting an older owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "vod",
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
		});
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = () => false;
		const olderOwner = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 200000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["vod:2827992810", 100000],
			]),
		};
		const bootstrappedWorker = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 199000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackBootstrapObservedAtByMediaKey: new Map([
				["vod:2827992810", 199500],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [olderOwner, bootstrappedWorker];

		try {
			expect(
				recover(bootstrappedWorker, {}, "Bootstrapped VOD worker crashed"),
			).toBe(true);
			expect(installFallback).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("recovers an observed worker that terminates without a replacement", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const scheduleTerminationRecovery = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => boolean
		>("_scheduleTerminatedPlaybackWorkerRecovery");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => false);
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const worker = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 90000,
			__TTVABFirstPongAt: 99000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};

		try {
			expect(
				scheduleTerminationRecovery(worker, {
					MediaType: "live",
					ChannelName: "testchannel",
				}),
			).toBe(true);
			expect(installFallback).toHaveBeenCalledOnce();
			vi.advanceTimersByTime(14999);
			expect(worker.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1001);
			expect(worker.__TTVABCrashed).toBe(true);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("ignores an unobserved auxiliary termination with a healthy media owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const scheduleTerminationRecovery = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => boolean
		>("_scheduleTerminatedPlaybackWorkerRecovery");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => true);
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const auxiliary = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 99000,
			__TTVABPageMediaKey: "live:testchannel",
		};
		const mediaOwner = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 99000,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [auxiliary, mediaOwner];

		try {
			expect(scheduleTerminationRecovery(auxiliary, {})).toBe(false);
			expect(installFallback).not.toHaveBeenCalled();
			vi.advanceTimersByTime(60000);
			expect(playerTask).not.toHaveBeenCalled();
			expect(auxiliary.__TTVABCrashed).toBeUndefined();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("does not let a lower-generation owner suppress early termination recovery", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};
		const staleCandidate = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 99000,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [terminated, staleCandidate];
		(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).set(
			"live:testchannel",
			3,
		);

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {}),
			).toBe(true);
			expect(installFallback).toHaveBeenCalledOnce();
			expect(
				(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).get(
					"live:testchannel",
				),
			).toBe(3);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
		}
	});

	it("does not accept construction or bootstrap alone as an early replacement", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 99900,
			__TTVABPageMediaKey: "live:testchannel",
		};
		const bootstrapOnly = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 100000,
			__TTVABFirstPongAt: 100000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackBootstrapObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [terminated, bootstrapOnly];

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {}),
			).toBe(true);
			vi.advanceTimersByTime(179999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
		}
	});

	it("accepts only a newer successful media owner after early termination", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 99900,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {}),
			).toBe(true);
			(g._S as { workers: unknown[] }).workers = [
				{
					__TTVABGeneration: 2,
					__TTVABCreatedAt: 100001,
					__TTVABFirstPongAt: 105000,
					__TTVABLastPongAt: 105000,
					__TTVABPageMediaKey: "live:testchannel",
					__TTVABPlaybackObservedAtByMediaKey: new Map([
						["live:testchannel", 105000],
					]),
				},
			];
			vi.advanceTimersByTime(5000);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			expect(
				(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).get(
					"live:testchannel",
				),
			).toBe(2);
			vi.advanceTimersByTime(180000);
			expect(terminated.__TTVABCrashed).toBeUndefined();
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
		}
	});

	it("recovers paused playback that had already started without pause intent", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		const previousPauseIntent = g._hasUserPauseIntent;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		g._hasUserPauseIntent = () => false;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PlayerHasPlayedOnce = true;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(19999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
			g._hasUserPauseIntent = previousPauseIntent;
		}
	});

	it("keeps an early termination deferred through manual pause", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let paused = true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousPauseIntent = g._hasUserPauseIntent;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		g._hasUserPauseIntent = () => paused;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(200000);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			paused = false;
			vi.advanceTimersByTime(89999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._hasUserPauseIntent = previousPauseIntent;
		}
	});

	it("stops early-termination monitoring when playback keeps advancing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const media = document.createElement("video");
		Object.defineProperty(media, "currentTime", {
			configurable: true,
			get: () => (Date.now() - 100000) / 1000,
		});
		g._getPrimaryMediaElement = () => media;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PlayerHasPlayedOnce = true;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(200000);
			expect(terminated.__TTVABCrashed).toBeUndefined();
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
		}
	});

	it("keeps monitoring temporary buffer progress and recovers after it drains", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const media = document.createElement("video");
		Object.defineProperty(media, "currentTime", {
			configurable: true,
			get: () => Math.min(10, (Date.now() - 100000) / 1000),
		});
		g._getPrimaryMediaElement = () => media;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PlayerHasPlayedOnce = true;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(24999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
		}
	});

	it("keeps early recovery bounded across stalled media element replacements", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const firstMedia = document.createElement("video");
		const secondMedia = document.createElement("video");
		firstMedia.currentTime = 10;
		secondMedia.currentTime = 10;
		let mediaSample = 0;
		g._getPrimaryMediaElement = () =>
			mediaSample++ % 2 === 0 ? firstMedia : secondMedia;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PlayerHasPlayedOnce = true;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(19999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
		}
	});

	it("recovers a live media element that becomes ended after its worker dies", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = vi.fn();
		const media = document.createElement("video");
		Object.defineProperty(media, "ended", {
			configurable: true,
			value: true,
		});
		g._getPrimaryMediaElement = () => media;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {});
			vi.advanceTimersByTime(19999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
		}
	});

	it("does not recover a naturally completed VOD after its worker terminates", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "vod",
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
		});
		g._installPageSideM3U8Override = vi.fn();
		const media = document.createElement("video");
		Object.defineProperty(media, "ended", {
			configurable: true,
			value: true,
		});
		g._getPrimaryMediaElement = () => media;
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
		};

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {}),
			).toBe(true);
			vi.advanceTimersByTime(200000);
			expect(terminated.__TTVABCrashed).toBeUndefined();
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
		}
	});

	it("uses the exact paused PiP element without installing fallback for another route", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPrimaryMedia = g._getPrimaryMediaElement;
		const previousIsPip = g._isActivePictureInPicturePlaybackContext;
		const previousGetPip = g._getActivePictureInPicturePlaybackContext;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "otherchannel",
			MediaKey: "live:otherchannel",
		});
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		const pipMedia = document.createElement("video");
		pipMedia.currentTime = 25;
		const currentRouteMedia = document.createElement("video");
		Object.defineProperty(currentRouteMedia, "currentTime", {
			configurable: true,
			get: () => (Date.now() - 100000) / 1000,
		});
		g._getPrimaryMediaElement = () => currentRouteMedia;
		g._isActivePictureInPicturePlaybackContext = (context: {
			MediaKey?: string;
		}) => context.MediaKey === "live:pipchannel";
		g._getActivePictureInPicturePlaybackContext = () => ({
			MediaType: "live",
			ChannelName: "pipchannel",
			MediaKey: "live:pipchannel",
			element: pipMedia,
		});
		const terminated = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABPageMediaKey: "live:pipchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => boolean
			>("_scheduleTerminatedPlaybackWorkerRecovery")(terminated, {
				MediaType: "live",
				ChannelName: "pipchannel",
				MediaKey: "live:pipchannel",
			});
			vi.advanceTimersByTime(19999);
			expect(terminated.__TTVABCrashed).toBeUndefined();
			vi.advanceTimersByTime(1);
			expect(terminated.__TTVABCrashed).toBe(true);
			expect(installFallback).not.toHaveBeenCalled();
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._installPageSideM3U8Override = previousInstallFallback;
			g._getPrimaryMediaElement = previousGetPrimaryMedia;
			g._isActivePictureInPicturePlaybackContext = previousIsPip;
			g._getActivePictureInPicturePlaybackContext = previousGetPip;
		}
	});

	it("accepts a post-termination playlist owner without reloading", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const scheduleTerminationRecovery = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => boolean
		>("_scheduleTerminatedPlaybackWorkerRecovery");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => false);
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const worker = {
			__TTVABIntentionallyTerminated: true,
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 90000,
			__TTVABFirstPongAt: 99000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};

		try {
			expect(
				scheduleTerminationRecovery(worker, {
					MediaType: "live",
					ChannelName: "testchannel",
				}),
			).toBe(true);
			vi.advanceTimersByTime(1);
			const replacement = {
				__TTVABGeneration: 2,
				__TTVABCreatedAt: 99950,
				__TTVABFirstPongAt: 100001,
				__TTVABLastPongAt: 100001,
				__TTVABPageMediaKey: "live:testchannel",
				__TTVABPlaybackObservedAtByMediaKey: new Map([
					["live:testchannel", 100001],
				]),
			};
			(g._S as { workers: unknown[] }).workers = [replacement];
			vi.advanceTimersByTime(14999);
			expect(worker.__TTVABCrashed).toBeUndefined();
			expect(playerTask).not.toHaveBeenCalled();
			expect(
				(g._WorkerPlaybackOwnerGenerationByContext as Map<string, number>).get(
					"live:testchannel",
				),
			).toBe(2);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("accepts only a newer pre-termination playback owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const scheduleTerminationRecovery = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => boolean
		>("_scheduleTerminatedPlaybackWorkerRecovery");
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		const terminated = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 90000,
			__TTVABFirstPongAt: 99000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 99000],
			]),
		};
		const olderOverlap = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 99000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 99500],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [olderOverlap, terminated];

		try {
			expect(scheduleTerminationRecovery(terminated, {})).toBe(true);
			expect(installFallback).toHaveBeenCalledOnce();

			const newerOwner = {
				...olderOverlap,
				__TTVABGeneration: 3,
			};
			const secondTerminated = {
				...terminated,
				__TTVABTerminatedAt: 0,
				__TTVABTerminationRecoveryTimer: null,
			};
			(g._S as { workers: unknown[] }).workers = [newerOwner, secondTerminated];
			expect(scheduleTerminationRecovery(secondTerminated, {})).toBe(false);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("recovers a worker terminated after a successful master bootstrap", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "vod",
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
		});
		g._installPageSideM3U8Override = vi.fn();
		const worker = {
			__TTVABGeneration: 1,
			__TTVABCreatedAt: 90000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackBootstrapObservedAtByMediaKey: new Map([
				["vod:2827992810", 100000],
			]),
		};

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(worker, {}),
			).toBe(true);
			expect(worker.__TTVABTerminationRecoveryTimer).not.toBeNull();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("does not recover a bootstrap-only termination while media still has an owner", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		const installFallback = vi.fn();
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "vod",
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
		});
		g._installPageSideM3U8Override = installFallback;
		const mediaOwner = {
			__TTVABGeneration: 1,
			__TTVABFirstPongAt: 90000,
			__TTVABLastPongAt: 100000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackObservedAtByMediaKey: new Map([["vod:2827992810", 80000]]),
		};
		const bootstrapOnlyWorker = {
			__TTVABGeneration: 2,
			__TTVABCreatedAt: 99000,
			__TTVABPageMediaType: "vod",
			__TTVABPageVodID: "2827992810",
			__TTVABPageMediaKey: "vod:2827992810",
			__TTVABPlaybackBootstrapObservedAtByMediaKey: new Map([
				["vod:2827992810", 99500],
			]),
		};
		(g._S as { workers: unknown[] }).workers = [
			mediaOwner,
			bootstrapOnlyWorker,
		];

		try {
			expect(
				T<
					(
						worker: Record<string, unknown>,
						context: Record<string, unknown>,
					) => boolean
				>("_scheduleTerminatedPlaybackWorkerRecovery")(bootstrapOnlyWorker, {}),
			).toBe(false);
			expect(installFallback).not.toHaveBeenCalled();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("retries when a real reload produces no playback worker", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => {
			if (playerTask.mock.calls.length === 1) {
				recordTestPlayerReload("live:testchannel");
				return true;
			}
			return false;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(31000);
			expect(playerTask).toHaveBeenCalledTimes(2);
			expect(
				T<(context: Record<string, unknown>) => Record<string, unknown>>(
					"_getWorkerRecoveryState",
				)({
					MediaType: "live",
					ChannelName: "testchannel",
				}).attempts,
			).toBe(2);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("confirms a real reload only after its exact playback worker appears", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => {
			const now = Date.now();
			recordTestPlayerReload("live:testchannel", now);
			(g._S as { workers: unknown[] }).workers = [
				{
					__TTVABGeneration: 2,
					__TTVABCreatedAt: now,
					__TTVABFirstPongAt: now,
					__TTVABLastPongAt: now,
					__TTVABPageMediaKey: "live:testchannel",
					__TTVABPlaybackObservedAtByMediaKey: new Map([
						["live:testchannel", now],
					]),
				},
			];
			return true;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(2000);
			expect(playerTask).toHaveBeenCalledOnce();
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")({
				MediaType: "live",
				ChannelName: "testchannel",
			});
			expect(recoveryState.phase).toBe("stabilizing");
			expect(recoveryState.stableGeneration).toBe(2);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("does not consume recovery attempts while exact playback is manually paused", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let paused = true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousPauseIntent = g._hasUserPauseIntent;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._hasUserPauseIntent = () => paused;
		const playerTask = vi.fn(() => {
			recordTestPlayerReload("live:testchannel");
			return true;
		});
		g._doPlayerTask = playerTask;
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				context,
			);
			vi.advanceTimersByTime(30000);
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")(context);
			expect(recoveryState.phase).toBe("waiting-user-pause");
			expect(recoveryState.attempts).toBe(0);
			expect(playerTask).not.toHaveBeenCalled();

			paused = false;
			vi.advanceTimersByTime(5000);
			expect(playerTask).toHaveBeenCalledOnce();
			expect(recoveryState.attempts).toBe(1);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousPauseIntent === undefined) {
				delete g._hasUserPauseIntent;
			} else {
				g._hasUserPauseIntent = previousPauseIntent;
			}
		}
	});

	it("keeps a paused off-route PiP recovery alive past its original deadline", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let paused = true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousPipMatch = g._isActivePictureInPicturePlaybackContext;
		const previousPauseIntent = g._hasUserPauseIntent;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "otherchannel",
			MediaKey: "live:otherchannel",
		});
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => context.MediaKey === "live:testchannel";
		g._hasUserPauseIntent = () => paused;
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				context,
			);
			vi.advanceTimersByTime(180000);
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")(context);
			expect(recoveryState.phase).toBe("waiting-user-pause");
			expect(recoveryState.attempts).toBe(0);
			expect(playerTask).not.toHaveBeenCalled();

			paused = false;
			vi.advanceTimersByTime(5000);
			expect(recoveryState.phase).toBe("waiting-pip");
			expect(playerTask).not.toHaveBeenCalled();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			g._isActivePictureInPicturePlaybackContext = previousPipMatch;
			if (previousPauseIntent === undefined) {
				delete g._hasUserPauseIntent;
			} else {
				g._hasUserPauseIntent = previousPauseIntent;
			}
		}
	});

	it("waits for a navigated Picture-in-Picture worker without reloading another stream", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let routeMediaKey = "live:otherchannel";
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousPipMatch = g._isActivePictureInPicturePlaybackContext;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._installPageSideM3U8Override = vi.fn();
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName:
				routeMediaKey === "live:testchannel" ? "testchannel" : "otherchannel",
			MediaKey: routeMediaKey,
		});
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => context.MediaKey === "live:testchannel";
		const playerTask = vi.fn(
			(
				_pausePlay: boolean,
				_reload: boolean,
				options: Record<string, unknown>,
			) => {
				recordTestPlayerReload(String(options.mediaKey));
				return true;
			},
		);
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(20000);
			expect(playerTask).not.toHaveBeenCalled();
			expect(
				T<(context: Record<string, unknown>) => Record<string, unknown>>(
					"_getWorkerRecoveryState",
				)({
					MediaType: "live",
					ChannelName: "testchannel",
				}).phase,
			).toBe("waiting-pip");
			vi.advanceTimersByTime(71000);
			expect(playerTask).not.toHaveBeenCalled();
			expect(g._installPageSideM3U8Override).not.toHaveBeenCalled();
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")({
				MediaType: "live",
				ChannelName: "testchannel",
			});
			expect(recoveryState.phase).toBe("degraded-pip");
			expect(recoveryState.activeEpoch).toBeGreaterThan(0);
			routeMediaKey = "live:testchannel";
			vi.advanceTimersByTime(15000);
			expect(playerTask).toHaveBeenCalledOnce();
			expect(playerTask.mock.calls[0]?.[2]).toMatchObject({
				reason: "worker-recovery",
				mediaKey: "live:testchannel",
			});
			expect(
				T<(mediaKey: string) => number>("_getPlayerReloadAtForMediaKey")(
					"live:testchannel",
				),
			).toBe(Date.now());
			expect(recoveryState.phase).toBe("awaiting-successor");
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			g._isActivePictureInPicturePlaybackContext = previousPipMatch;
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});

	it("cancels degraded PiP recovery when PiP closes on another route", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let pipActive = true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousPipMatch = g._isActivePictureInPicturePlaybackContext;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "otherchannel",
			MediaKey: "live:otherchannel",
		});
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => pipActive && context.MediaKey === "live:testchannel";
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		const playerTask = vi.fn(() => true);
		g._doPlayerTask = playerTask;
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABGeneration: 1,
					__TTVABPageMediaKey: "live:testchannel",
				},
				context,
			);
			vi.advanceTimersByTime(91000);
			const recoveryState = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_getWorkerRecoveryState")(context);
			expect(recoveryState.phase).toBe("degraded-pip");
			pipActive = false;
			vi.advanceTimersByTime(15000);
			expect(recoveryState.phase).toBe("cancelled");
			expect(recoveryState.activeEpoch).toBe(0);
			expect(playerTask).not.toHaveBeenCalled();
			expect(installFallback).not.toHaveBeenCalled();
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._isActivePictureInPicturePlaybackContext = previousPipMatch;
			g._installPageSideM3U8Override = previousInstallFallback;
		}
	});

	it("stops after the bounded recovery cap when the player never reloads", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousInstallFallback = g._installPageSideM3U8Override;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		const playerTask = vi.fn(() => false);
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{
					__TTVABCrashed: true,
					__TTVABPageMediaKey: "live:testchannel",
				},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(7000);
			expect(playerTask).toHaveBeenCalledTimes(3);
			expect(installFallback).toHaveBeenCalledOnce();
			vi.advanceTimersByTime(30000);
			expect(playerTask).toHaveBeenCalledTimes(3);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
		}
	});
});

describe("MAIN VOD ad request guard", () => {
	it("rewrites standard-video VOD XHR to a local empty VAST", async () => {
		const originalFetch = window.fetch;
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalIncrementAdsBlocked = g._incrementAdsBlocked;
		const xhrPrototype = window.XMLHttpRequest.prototype;
		const originalOpen = xhrPrototype.open;
		const nativeOpen = vi.fn();
		const nativeFetch = vi.fn(
			async () => new Response("native", { status: 200 }),
		);
		const emptyVastUrl =
			"data:application/xml,%3CVAST%20version%3D%223.0%22%3E%3C%2FVAST%3E";
		const incrementAdsBlocked = vi.fn();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		state.PageMediaType = "vod";
		state.PageVodID = "2827992810";
		state.PageMediaKey = "vod:2827992810";
		window.fetch = nativeFetch as typeof fetch;
		xhrPrototype.open = nativeOpen as typeof xhrPrototype.open;
		g._incrementAdsBlocked = incrementAdsBlocked;

		try {
			T<() => void>("_hookMainFetch")();
			const adUrl =
				"https://edge.ads.twitch.tv/2018-01-01/3p/ads?rt=vast3&dur=30&sid=shared-break";
			new window.XMLHttpRequest().open("GET", adUrl);

			expect(nativeOpen).toHaveBeenLastCalledWith("GET", emptyVastUrl);
			for (const path of ["/ads", "/ads/format"]) {
				new window.XMLHttpRequest().open(
					"GET",
					`https://edge.ads.twitch.tv${path}?afmt=1&sid=shared-break`,
				);
				expect(nativeOpen).toHaveBeenLastCalledWith("GET", emptyVastUrl);
			}
			expect(incrementAdsBlocked).toHaveBeenCalledOnce();
			expect(incrementAdsBlocked).toHaveBeenLastCalledWith(
				null,
				"vod:2827992810",
			);
			const fetchResponse = await window.fetch(
				"https://edge.ads.twitch.tv/ads?afmt=1&sid=shared-break",
			);
			expect(fetchResponse.status).toBe(204);
			new window.XMLHttpRequest().open("GET", adUrl);
			expect(incrementAdsBlocked).toHaveBeenCalledTimes(1);
			expect(nativeFetch).not.toHaveBeenCalled();

			state.PageMediaType = "live";
			state.PageVodID = null;
			state.PageMediaKey = "live:testchannel";
			new window.XMLHttpRequest().open("GET", adUrl);
			expect(nativeOpen).toHaveBeenLastCalledWith("GET", adUrl);

			state.IsAdStrippingEnabled = false;
			state.PageMediaType = "vod";
			state.PageVodID = "2827992810";
			state.PageMediaKey = "vod:2827992810";
			new window.XMLHttpRequest().open("GET", adUrl);
			expect(nativeOpen).toHaveBeenLastCalledWith("GET", adUrl);

			state.IsAdStrippingEnabled = true;
			new window.XMLHttpRequest().open("POST", adUrl);
			expect(nativeOpen).toHaveBeenLastCalledWith("POST", adUrl);
			const nonAdUrl = "https://edge.ads.twitch.tv/2018-01-01/3p/ads/extra";
			new window.XMLHttpRequest().open("GET", nonAdUrl);
			expect(nativeOpen).toHaveBeenLastCalledWith("GET", nonAdUrl);
			const nextBreakUrl =
				"https://edge.ads.twitch.tv/2018-01-01/3p/ads?rt=vast3&dur=30&sid=next-break";
			new window.XMLHttpRequest().open("GET", nextBreakUrl);
			expect(nativeOpen).toHaveBeenLastCalledWith("GET", emptyVastUrl);
			expect(nativeOpen).toHaveBeenCalledTimes(9);
			expect(incrementAdsBlocked).toHaveBeenCalledTimes(2);
		} finally {
			window.fetch = originalFetch;
			xhrPrototype.open = originalOpen;
			g._incrementAdsBlocked = originalIncrementAdsBlocked;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
		}
	});

	it("returns Twitch's no-fill response before a VOD ad can pause playback", async () => {
		const originalFetch = window.fetch;
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalIncrementAdsBlocked = g._incrementAdsBlocked;
		const xhrPrototype = window.XMLHttpRequest.prototype;
		const originalOpen = xhrPrototype.open;
		const nativeFetch = vi.fn(
			async () => new Response("native", { status: 200 }),
		);
		const incrementAdsBlocked = vi.fn();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		state.PageMediaType = "vod";
		state.PageVodID = "2827992810";
		state.PageMediaKey = "vod:2827992810";
		window.fetch = nativeFetch as typeof fetch;
		g._incrementAdsBlocked = incrementAdsBlocked;

		try {
			T<() => void>("_hookMainFetch")();
			const inputs: Array<string | URL | Request> = [
				"https://edge.ads.twitch.tv/2018-01-01/3p/ads?rt=vast3&dur=30&sid=shared-break",
				new URL("https://edge.ads.twitch.tv/ads?afmt=1&sid=shared-break"),
				new Request(
					"https://edge.ads.twitch.tv/ads/format?afmt=1&sid=shared-break",
				),
				"https://vaes.amazon-adsystem.com/2018-01-01/3p/ads?rt=vast3&dur=30&sid=shared-break",
			];

			for (const input of inputs) {
				const response = await window.fetch(input);
				expect(response.status).toBe(204);
				expect(response.statusText).toBe("No Content");
				expect(await response.text()).toBe("");
			}
			expect(nativeFetch).not.toHaveBeenCalled();
			expect(incrementAdsBlocked).toHaveBeenCalledTimes(1);
			const nextBreakResponse = await window.fetch(
				"https://edge.ads.twitch.tv/2018-01-01/3p/ads?rt=vast3&sid=next-break",
			);
			expect(nextBreakResponse.status).toBe(204);
			expect(incrementAdsBlocked).toHaveBeenCalledTimes(2);
			expect(incrementAdsBlocked).toHaveBeenLastCalledWith(
				null,
				"vod:2827992810",
			);
			expect(scopedWindow.__TTVAB_REAL_FETCH__).toBe(nativeFetch);
		} finally {
			window.fetch = originalFetch;
			xhrPrototype.open = originalOpen;
			g._incrementAdsBlocked = originalIncrementAdsBlocked;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
		}
	});

	it("passes through live, disabled, and non-ad requests unchanged", async () => {
		const originalFetch = window.fetch;
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const xhrPrototype = window.XMLHttpRequest.prototype;
		const originalOpen = xhrPrototype.open;
		const nativeFetch = vi.fn(
			async () => new Response("native", { status: 200 }),
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const adUrl =
			"https://edge.ads.twitch.tv/2018-01-01/3p/ads?rt=vast3&dur=30";
		window.fetch = nativeFetch as typeof fetch;

		try {
			T<() => void>("_hookMainFetch")();
			state.IsAdStrippingEnabled = true;
			state.PageMediaType = "live";
			state.PageVodID = null;
			state.PageMediaKey = "live:testchannel";
			expect(await (await window.fetch(adUrl)).text()).toBe("native");

			state.IsAdStrippingEnabled = false;
			state.PageMediaType = "vod";
			state.PageVodID = "2827992810";
			state.PageMediaKey = "vod:2827992810";
			expect(await (await window.fetch(adUrl)).text()).toBe("native");

			state.IsAdStrippingEnabled = true;
			for (const url of [
				"https://edge.ads.twitch.tv.example/2018-01-01/3p/ads",
				"https://edge.ads.twitch.tv:8443/2018-01-01/3p/ads",
				"http://edge.ads.twitch.tv/2018-01-01/3p/ads",
				"https://edge.ads.twitch.tv/2018-01-01/3p/ads/extra",
			]) {
				expect(await (await window.fetch(url)).text()).toBe("native");
			}
			expect(
				await (
					await window.fetch(adUrl, {
						method: "POST",
						body: "not-a-vod-ad-fetch",
					})
				).text(),
			).toBe("native");
			expect(
				await (
					await window.fetch(new Request(adUrl), { method: "POST" })
				).text(),
			).toBe("native");

			expect(nativeFetch).toHaveBeenCalledTimes(8);
		} finally {
			window.fetch = originalFetch;
			xhrPrototype.open = originalOpen;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
		}
	});
});

describe("page-side M3U8 fallback", () => {
	it("detects Twitch ad metadata beyond literal stitched-ad markers", () => {
		const hasMetadata = T<(text: string) => boolean>("_hasTwitchAdMetadata");

		expect(hasMetadata("#EXTM3U\n#EXT-X-CUE-OUT:30")).toBe(true);
		expect(hasMetadata('#EXTM3U\n#EXT-X-DATERANGE:CLASS="twitch-ad"')).toBe(
			true,
		);
		expect(hasMetadata("#EXTM3U\n#EXTINF:2.000,\nclean.ts")).toBe(false);
	});

	it("strips degraded fallback ad blocks marked by cue-out tags", () => {
		const strip = T<(text: string) => string>("_stripM3U8Ads");
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:1",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-1.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"ad-2.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"clean.ts",
		].join("\n");

		const stripped = strip(playlist);

		expect(stripped).not.toContain("#EXT-X-CUE-OUT");
		expect(stripped).not.toContain("ad-1.ts");
		expect(stripped).not.toContain("ad-2.ts");
		expect(stripped).not.toContain("clean.ts");
		expect(stripped).toContain("__ttvab_empty_hold_segment.mp4");
	});

	it("serves an advancing empty hold when degraded stripping removes every segment", () => {
		const strip =
			T<(text: string, info?: Record<string, unknown> | null) => string>(
				"_stripM3U8Ads",
			);
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:70",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-70.ts",
			"#EXTINF:2.000,",
			"ad-71.ts",
		].join("\n");
		const info = {
			MediaKey: "live:testchannel",
			_EmptyAdHoldMediaSequence: 0,
		};

		const first = strip(playlist, info);
		const second = strip(playlist, info);

		expect(first).not.toContain("ad-70.ts");
		expect(first).not.toContain("ad-71.ts");
		expect(first).toContain("__ttvab_empty_hold_segment.mp4");
		expect(first).toContain("#EXT-X-MEDIA-SEQUENCE:71");
		expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:72");
	});

	it("does not inherit codec ownership when another media context reuses the URL", () => {
		const rememberOwner = T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string | null,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner");
		const exactUrlKey = T<(playlistUrl: string) => string>(
			"_getExactPlaylistUrlKey",
		);
		const getAliases = T<(playlistUrl: string) => string[]>(
			"_getPlaylistUrlAliases",
		);
		const owners = g._pageSidePlaybackOwnerByUrl as Map<
			string,
			{ mediaKey: string; codecFamily: string | null }
		>;
		const codecs = g._pageSideVariantCodecByUrl as Map<string, string>;
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/reused.m3u8?session=shared";

		rememberOwner("live:first", url, "avc1.64002A", 1000, {
			confirmedPlayback: true,
			workerGeneration: 1,
		});
		rememberOwner("live:second", url, null, 2000, {
			confirmedPlayback: false,
		});

		expect(owners.get(exactUrlKey(url))).toMatchObject({
			mediaKey: "live:second",
			codecFamily: null,
		});
		for (const alias of getAliases(url)) {
			expect(codecs.has(alias)).toBe(false);
		}
	});

	it("does not let ad metadata downgrade confirmed enhanced decoder ownership", () => {
		const rememberOwner = T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string | null,
				cycleStartedAt: number,
				ownership?: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner");
		const exactUrlKey = T<(playlistUrl: string) => string>(
			"_getExactPlaylistUrlKey",
		);
		const owners = g._pageSidePlaybackOwnerByUrl as Map<
			string,
			{ codecFamily: string | null; decoderCodecFamily: string | null }
		>;
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/enhanced.m3u8";

		rememberOwner("live:testchannel", url, "hev1.1.6.L153.B0", 0, {
			confirmedPlayback: true,
			decoderCodec: "hev1.1.6.L153.B0",
		});
		rememberOwner("live:testchannel", url, null, 90000, {
			confirmedPlayback: false,
			adMarked: true,
		});

		expect(owners.get(exactUrlKey(url))).toMatchObject({
			codecFamily: "hevc",
			decoderCodecFamily: "hevc",
		});
	});

	it("trusts decoder ownership only after Pong promotes the exact worker generation", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const rememberOwner = T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner");
		const getTrusted = T<
			(
				url: string,
				mediaKey: string,
				cycleStartedAt?: number,
			) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");
		const worker = {
			__TTVABGeneration: 2,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100000],
			]),
		};
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/pong-gated.m3u8";
		rememberOwner("live:testchannel", url, "avc1.64002A", 90000, {
			confirmedPlayback: true,
			workerGeneration: 2,
			decoderCodec: "avc1.64002A",
		});

		expect(getTrusted(url, "live:testchannel", 90000)).toBeNull();
		T<(worker: Record<string, unknown>, now?: number) => void>(
			"_markWorkerPong",
		)(worker, 100000);
		expect(getTrusted(url, "live:testchannel", 90000)).not.toBeNull();
	});

	it("rejects same-millisecond pre-reload and retired decoder ownership", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const getTrusted = T<
			(
				url: string,
				mediaKey: string,
				cycleStartedAt?: number,
			) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/reload-fenced.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000, {
			generation: 2,
		});
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.LastPlayerReloadAt = 100000;
		T<(mediaKey: string, at: number) => number>("_recordPlayerReloadAt")(
			"live:testchannel",
			100000,
		);

		expect(getTrusted(url, "live:testchannel", 90000)).toBeNull();

		vi.setSystemTime(100001);
		T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner")(
			"live:testchannel",
			url,
			"avc1.64002A",
			90000,
			{
				confirmedPlayback: true,
				workerGeneration: 2,
				decoderCodec: "avc1.64002A",
			},
		);
		expect(getTrusted(url, "live:testchannel", 90000)).not.toBeNull();

		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({ MediaKey: "live:testchannel" }).retiredThroughGeneration = 2;
		expect(getTrusted(url, "live:testchannel", 90000)).toBeNull();
	});

	it("scopes reload ownership fences to the exact playback context", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const getTrusted = T<
			(url: string, mediaKey: string) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");
		const recordReload = T<(mediaKey: string, at: number) => number>(
			"_recordPlayerReloadAt",
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const pageUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/page.m3u8";
		const pipUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/pip.m3u8";
		confirmPlaybackOwner("live:testchannel", pageUrl, "avc1.64002A");
		confirmPlaybackOwner("live:pipchannel", pipUrl, "avc1.64002A");
		state.PageMediaKey = "live:testchannel";
		state.LastPlayerReloadAt = 100001;
		recordReload("live:pipchannel", 100001);

		expect(getTrusted(pageUrl, "live:testchannel")).not.toBeNull();
		expect(getTrusted(pipUrl, "live:pipchannel")).toBeNull();

		vi.setSystemTime(100002);
		confirmPlaybackOwner("live:pipchannel", pipUrl, "avc1.64002A");
		state.LastPlayerReloadAt = 100003;
		recordReload("live:testchannel", 100003);
		expect(getTrusted(pageUrl, "live:testchannel")).toBeNull();
		expect(getTrusted(pipUrl, "live:pipchannel")).not.toBeNull();
	});

	it("retains exact reload fences beyond the page-side owner cache bound", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const getTrusted = T<
			(url: string, mediaKey: string) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");
		const recordReload = T<(mediaKey: string, at: number) => number>(
			"_recordPlayerReloadAt",
		);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/retained-fence.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A");
		recordReload("live:testchannel", 100001);
		for (let index = 0; index < 48; index++) {
			recordReload(`live:channel${index}`, 100002 + index);
		}
		(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt = 0;

		expect(getTrusted(url, "live:testchannel")).toBeNull();
		expect(
			T<(mediaKey: string) => number>("_getPlayerReloadAtForMediaKey")(
				"live:testchannel",
			),
		).toBe(100001);
	});

	it("rejects known decoder mismatch and omitted confirmation metadata", () => {
		const getTrusted = T<
			(url: string, mediaKey: string) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");
		const mismatchedUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/mismatch.m3u8";
		confirmPlaybackOwner("live:testchannel", mismatchedUrl, "avc1.64002A", 0, {
			decoderCodec: "hev1.1.6.L153.B0",
		});
		expect(getTrusted(mismatchedUrl, "live:testchannel")).toBeNull();

		const omittedUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/omitted.m3u8";
		T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string,
				cycleStartedAt: number,
			) => boolean
		>("_rememberPageSidePlaybackOwner")(
			"live:testchannel",
			omittedUrl,
			"avc1.64002A",
			0,
		);
		expect(getTrusted(omittedUrl, "live:testchannel")).toBeNull();
	});

	it("does not refresh stale AVC ownership from a codec-less successor observation", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/codecless-successor.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A");
		recordTestPlayerReload("live:testchannel", 100001);
		vi.setSystemTime(100002);
		const successor = {
			__TTVABGeneration: 2,
			__TTVABFirstPongAt: 100002,
			__TTVABLastPongAt: 100002,
			__TTVABPageMediaKey: "live:testchannel",
			__TTVABPlaybackObservedAtByMediaKey: new Map([
				["live:testchannel", 100002],
			]),
		};
		T<
			(
				worker: Record<string, unknown>,
				now?: number,
				context?: Record<string, unknown>,
			) => boolean
		>("_promoteWorkerPlaybackOwner")(successor, 100002, {
			MediaKey: "live:testchannel",
		});
		T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string | null,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner")("live:testchannel", url, null, 0, {
			confirmedPlayback: true,
			workerGeneration: 2,
			decoderCodec: null,
		});

		expect(
			T<(url: string, mediaKey: string) => Record<string, unknown> | null>(
				"_getTrustedPageSidePlaybackOwner",
			)(url, "live:testchannel"),
		).toBeNull();
		const exactKey = T<(url: string) => string>("_getExactPlaylistUrlKey")(url);
		expect(
			(
				g._pageSidePlaybackOwnerByUrl as Map<
					string,
					{ codecFamily: string | null }
				>
			).get(exactKey)?.codecFamily,
		).toBeNull();
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			url,
		)) {
			expect(
				(g._pageSideVariantCodecByUrl as Map<string, string>).has(alias),
			).toBe(false);
		}
	});

	it("requires a settled observation after codec handoff ownership clears", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/handoff-owned.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000, {
			handoffId: "live:testchannel:90000:99999:1:retiring",
		});
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.ActiveCodecHandoffId = null;
		state.ActiveCodecHandoffMediaKey = null;
		const getTrusted = T<
			(
				url: string,
				mediaKey: string,
				cycleStartedAt?: number,
			) => Record<string, unknown> | null
		>("_getTrustedPageSidePlaybackOwner");

		expect(getTrusted(url, "live:testchannel", 90000)).toBeNull();

		vi.setSystemTime(100001);
		T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner")(
			"live:testchannel",
			url,
			"avc1.64002A",
			90000,
			{
				confirmedPlayback: true,
				workerGeneration: 1,
				handoffId: null,
				decoderCodec: "avc1.64002A",
			},
		);
		expect(getTrusted(url, "live:testchannel", 90000)).not.toBeNull();
	});

	it.each(["avc", "hevc", "av1", null])(
		"fails closed on transiently clean inherited media with only %s capability metadata",
		async (codecFamily) => {
			const install = T<() => void>("_installPageSideM3U8Override");
			const scopedWindow = window as unknown as Record<string, unknown>;
			const originalFetch = window.fetch;
			const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
			const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			const previousState = {
				currentAdMediaKey: state.CurrentAdMediaKey,
				pageMediaKey: state.PageMediaKey,
				pageChannel: state.PageChannel,
			};
			const playlist = [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXTINF:2.000,",
				"https://edge.example/content-500.ts",
			].join("\n");
			const rawFetch = vi.fn(
				async () => new Response(playlist, { status: 200 }),
			);
			const url = `https://video-weaver.example.ttvnw.net/v1/playlist/${
				codecFamily || "unknown"
			}-clean.m3u8`;
			const variantCodecByUrl = g._pageSideVariantCodecByUrl as Map<
				string,
				string
			>;
			window.fetch = rawFetch as typeof fetch;
			scopedWindow.__TTVAB_REAL_FETCH__ = null;
			scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
			(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
			variantCodecByUrl.clear();
			state.CurrentAdMediaKey = "live:testchannel";
			state.PageMediaKey = "live:testchannel";
			state.PageChannel = "testchannel";
			if (codecFamily) {
				const codec =
					codecFamily === "avc"
						? "avc1.64002A"
						: codecFamily === "hevc"
							? "hev1.1.6.L153.B0"
							: "av01.0.13M.08";
				T<(text: string, baseUrl: string) => boolean>(
					"_rememberPageSideVariantCodecs",
				)(
					[
						"#EXTM3U",
						`#EXT-X-STREAM-INF:BANDWIDTH=8000000,CODECS="${codec},mp4a.40.2"`,
						url,
					].join("\n"),
					"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
				);
			}

			try {
				install();
				await expect(window.fetch(url)).rejects.toMatchObject({
					name: "AbortError",
				});
			} finally {
				window.fetch = originalFetch;
				if (originalRealFetch === undefined) {
					delete scopedWindow.__TTVAB_REAL_FETCH__;
				} else {
					scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
				}
				if (originalFallbackActive === undefined) {
					delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
				} else {
					scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
				}
				state.CurrentAdMediaKey = previousState.currentAdMediaKey;
				state.PageMediaKey = previousState.pageMediaKey;
				state.PageChannel = previousState.pageChannel;
			}
		},
	);

	it("serves an AVC hold only from exact confirmed ownership after handoff clears", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/confirmed-avc.m3u8";
		let mediaSequence = 500;
		window.fetch = vi.fn(
			async () =>
				new Response(
					[
						"#EXTM3U",
						"#EXT-X-TARGETDURATION:2",
						`#EXT-X-MEDIA-SEQUENCE:${mediaSequence++}`,
						"#EXTINF:2.000,",
						"https://edge.example/content.ts",
					].join("\n"),
					{ status: 200 },
				),
		) as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 90000 },
			},
			LastPlayerReloadAt: 0,
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffMediaKey: null,
		});
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000);

		try {
			install();
			const hold = await (await window.fetch(url)).text();
			expect(hold).toContain("__ttvab_empty_hold_segment.mp4");

			state.ActiveCodecHandoffId = "live:testchannel:90000:100001:1:pending";
			state.ActiveCodecHandoffMediaKey = "live:testchannel";
			await expect(window.fetch(url)).rejects.toMatchObject({
				name: "AbortError",
			});

			state.ActiveCodecHandoffId = null;
			state.ActiveCodecHandoffMediaKey = null;
			const resumedHold = await (await window.fetch(url)).text();
			expect(resumedHold).toContain("__ttvab_empty_hold_segment.mp4");
		} finally {
			window.fetch = originalFetch;
			Object.assign(state, previousState);
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("restores only after the retired ad playlist stays clean in terminal recovery", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const install = T<() => void>("_installPageSideM3U8Override");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const previousFunctions = {
			clearTimeouts: g._clearPlaybackRecoveryTimeoutsForContext,
			resetMonitor: g._resetPlayerBufferMonitorState,
			clearIntent: g._clearAdResumeIntent,
			restoreMedia: g._restoreSuppressedMediaAfterAd,
			scheduleCleanup: g._schedulePostAdArtifactCleanup,
			rememberPlayback: g._rememberPlayerPlaybackForAd,
			ensureMonitors: g._ensurePlaybackMonitorsRunning,
		};
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/retired-hevc.m3u8";
		const cycleStartedAt = 90000;
		let mediaSequence = 600;
		let serveAd = false;
		const rawFetch = vi.fn(async () => {
			const playlist = [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				`#EXT-X-MEDIA-SEQUENCE:${mediaSequence++}`,
				...(serveAd ? ["#EXT-X-CUE-OUT:30"] : []),
				"#EXTINF:2.000,",
				serveAd
					? "https://edge.example/adsquared/ad.ts"
					: "https://edge.example/native.ts",
			].join("\n");
			return new Response(playlist, { status: 200 });
		});

		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt },
			},
			StreamInfos: Object.create(null),
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
		});
		getRecoveryState({ MediaKey: "live:testchannel" }).phase = "exhausted";
		confirmPlaybackOwner(
			"live:testchannel",
			mediaUrl,
			"hev1.1.6.L153.B0",
			cycleStartedAt,
		);
		g._clearPlaybackRecoveryTimeoutsForContext = vi.fn();
		g._resetPlayerBufferMonitorState = vi.fn();
		g._clearAdResumeIntent = vi.fn();
		g._restoreSuppressedMediaAfterAd = vi.fn();
		g._schedulePostAdArtifactCleanup = vi.fn();
		g._rememberPlayerPlaybackForAd = vi.fn();
		g._ensurePlaybackMonitorsRunning = vi.fn();

		try {
			install();
			for (let i = 0; i < 6; i++) {
				await expect(window.fetch(mediaUrl)).rejects.toMatchObject({
					name: "AbortError",
				});
				vi.advanceTimersByTime(2000);
			}
			const restored = await (await window.fetch(mediaUrl)).text();

			expect(restored).toContain("native.ts");
			expect(state.CurrentAdMediaKey).toBe(null);
			expect(state.LastAdEndedMediaKey).toBe("live:testchannel");
			expect(state.LastAdEndedCycleStartedAt).toBe(cycleStartedAt);
			expect(
				(state.AdPodProgressByMediaKey as Record<string, unknown>)[
					"live:testchannel"
				],
			).toBeUndefined();
			vi.advanceTimersByTime(9000);
			serveAd = true;
			await expect(window.fetch(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			const secondCycleStartedAt = Number(
				(
					state.AdPodProgressByMediaKey as Record<
						string,
						{ cycleStartedAt: number }
					>
				)["live:testchannel"]?.cycleStartedAt,
			);
			expect(secondCycleStartedAt).toBeGreaterThan(cycleStartedAt);
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			serveAd = false;
			await expect(window.fetch(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect(rawFetch).toHaveBeenCalledTimes(9);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
			for (const key of Object.keys(state)) delete state[key];
			Object.assign(state, previousState);
			g._clearPlaybackRecoveryTimeoutsForContext =
				previousFunctions.clearTimeouts;
			g._resetPlayerBufferMonitorState = previousFunctions.resetMonitor;
			g._clearAdResumeIntent = previousFunctions.clearIntent;
			g._restoreSuppressedMediaAfterAd = previousFunctions.restoreMedia;
			g._schedulePostAdArtifactCleanup = previousFunctions.scheduleCleanup;
			g._rememberPlayerPlaybackForAd = previousFunctions.rememberPlayback;
			g._ensurePlaybackMonitorsRunning = previousFunctions.ensureMonitors;
		}
	});

	it("rearms terminal recovery after pause, stale handoff, and a transient no-op", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const rememberOwner = T<
			(
				mediaKey: string,
				playlistUrl: string,
				codec: string | null,
				cycleStartedAt: number,
				ownership: Record<string, unknown>,
			) => boolean
		>("_rememberPageSidePlaybackOwner");
		const recordReload = T<(mediaKey: string, at: number) => number>(
			"_recordPlayerReloadAt",
		);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		const previousPauseIntent = g._hasUserPauseIntent;
		const previousBroadcast = g._broadcastWorkers;
		let paused = true;
		let routeMediaKey = "live:testchannel";
		const mediaKey = "live:testchannel";
		const cycleStartedAt = 90000;
		const handoffId =
			"live:testchannel:90000:95000:1:terminal-recovery-handoff";
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/terminal-rearm.m3u8";
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: mediaKey,
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: mediaKey,
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdPodProgressByMediaKey: {
				[mediaKey]: { cycleStartedAt, updatedAt: 100000 },
			},
			ActiveCodecHandoffId: handoffId,
			ActiveCodecHandoffChannel: "testchannel",
			ActiveCodecHandoffMediaKey: mediaKey,
		});
		confirmPlaybackOwner(mediaKey, url, "avc1.64002A", cycleStartedAt, {
			handoffId,
		});
		rememberOwner(mediaKey, url, null, cycleStartedAt, {
			confirmedPlayback: false,
			adMarked: true,
		});
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")({ MediaKey: mediaKey });
		Object.assign(recoveryState, {
			attempts: 3,
			failedGeneration: 1,
			retiredThroughGeneration: 1,
			crashedAt: 100001,
			phase: "exhausted",
		});
		vi.setSystemTime(100001);
		state.LastPlayerReloadAt = 100001;
		recordReload(mediaKey, 100001);
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: routeMediaKey === mediaKey ? "testchannel" : "otherchannel",
			MediaKey: routeMediaKey,
		});
		g._hasUserPauseIntent = () => paused;
		const broadcast = vi.fn();
		g._broadcastWorkers = broadcast;
		const playerTask = vi.fn(
			(
				_pausePlay: boolean,
				_reload: boolean,
				options: Record<string, unknown>,
			) => {
				if (playerTask.mock.calls.length === 1) return false;
				const reloadedAt = Date.now();
				state.LastPlayerReloadAt = reloadedAt;
				recordReload(String(options.mediaKey), reloadedAt);
				return true;
			},
		);
		g._doPlayerTask = playerTask;
		const info: Record<string, unknown> = {};

		const check = (sequence: number) =>
			isReady(
				url,
				[
					"#EXTM3U",
					`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
					"#EXTINF:2.000,",
					"native.ts",
				].join("\n"),
				info,
				mediaKey,
			);

		try {
			for (let index = 0; index < 7; index++) {
				vi.setSystemTime(100001 + index * 2000);
				expect(check(700 + index)).toBe(false);
			}
			expect(playerTask).not.toHaveBeenCalled();
			expect(state.ActiveCodecHandoffId).toBe(handoffId);

			paused = false;
			routeMediaKey = "live:otherchannel";
			vi.setSystemTime(112002);
			expect(check(707)).toBe(false);
			expect(playerTask).not.toHaveBeenCalled();

			routeMediaKey = mediaKey;
			vi.setSystemTime(112003);
			expect(check(708)).toBe(false);
			expect(playerTask).toHaveBeenCalledOnce();
			expect(recoveryState.terminalRearmCycleStartedAt).toBe(0);
			expect(state.ActiveCodecHandoffId).toBe(null);
			expect(broadcast).toHaveBeenCalledWith(
				expect.objectContaining({
					key: "UpdateCodecHandoffContext",
					targetMediaKey: mediaKey,
				}),
			);

			vi.setSystemTime(142002);
			expect(check(709)).toBe(false);
			expect(playerTask).toHaveBeenCalledOnce();

			vi.setSystemTime(142003);
			expect(check(710)).toBe(false);
			expect(playerTask).toHaveBeenCalledTimes(2);
			expect(playerTask.mock.calls[1]?.[2]).toMatchObject({
				reason: "worker-recovery",
				mediaKey,
				cycleStartedAt,
			});
			expect(state.CurrentAdMediaKey).toBe(mediaKey);
			expect(recoveryState.terminalRearmCycleStartedAt).toBe(cycleStartedAt);

			vi.setSystemTime(142004);
			expect(check(711)).toBe(false);
			expect(playerTask).toHaveBeenCalledTimes(2);
		} finally {
			g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			g._hasUserPauseIntent = previousPauseIntent;
			g._broadcastWorkers = previousBroadcast;
		}
	});

	it("blocks the clean response that triggers a terminal recovery rearm", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const install = T<() => void>("_installPageSideM3U8Override");
		const recordReload = T<(mediaKey: string, at: number) => number>(
			"_recordPlayerReloadAt",
		);
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const mediaKey = "live:testchannel";
		const cycleStartedAt = 90000;
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/terminal-rearm-fetch.m3u8";
		let mediaSequence = 800;
		const rawFetch = vi.fn(
			async () =>
				new Response(
					[
						"#EXTM3U",
						"#EXT-X-TARGETDURATION:2",
						`#EXT-X-MEDIA-SEQUENCE:${mediaSequence++}`,
						"#EXTINF:2.000,",
						"native.ts",
					].join("\n"),
					{ status: 200 },
				),
		);
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageVodID: null,
			PageMediaKey: mediaKey,
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: mediaKey,
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdPodProgressByMediaKey: {
				[mediaKey]: { cycleStartedAt, updatedAt: 100000 },
			},
			StreamInfos: Object.create(null),
		});
		confirmPlaybackOwner(mediaKey, url, "avc1.64002A", cycleStartedAt);
		const recoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState")({ MediaKey: mediaKey });
		Object.assign(recoveryState, {
			attempts: 3,
			failedGeneration: 1,
			retiredThroughGeneration: 1,
			crashedAt: 100001,
			phase: "exhausted",
		});
		vi.setSystemTime(100001);
		recordReload(mediaKey, 100001);
		const playerTask = vi.fn(
			(
				_pausePlay: boolean,
				_reload: boolean,
				options: Record<string, unknown>,
			) => {
				recordReload(String(options.mediaKey), Date.now());
				return true;
			},
		);
		g._doPlayerTask = playerTask;

		try {
			install();
			for (let index = 0; index < 7; index++) {
				vi.setSystemTime(100001 + index * 2000);
				await expect(window.fetch(url)).rejects.toMatchObject({
					name: "AbortError",
				});
			}
			expect(playerTask).toHaveBeenCalledOnce();
			expect(rawFetch).toHaveBeenCalledTimes(7);
			expect(state.CurrentAdMediaKey).toBe(mediaKey);
			expect(recoveryState.terminalRearmCycleStartedAt).toBe(cycleStartedAt);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
			for (const key of Object.keys(state)) delete state[key];
			Object.assign(state, previousState);
		}
	});

	it("never treats elapsed clean playlists without same-cycle ad ownership as recovery proof", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdEndMinCleanPlaylists = 3;
		state.AdEndGraceMs = 500;
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 90000 },
		};
		getRecoveryState({ MediaKey: "live:testchannel" }).phase = "exhausted";
		const info: Record<string, unknown> = {};
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/unowned.m3u8";

		for (let i = 0; i < 20; i++) {
			const playlist = [
				"#EXTM3U",
				`#EXT-X-MEDIA-SEQUENCE:${700 + i}`,
				"#EXTINF:2.000,",
				"native.ts",
			].join("\n");
			expect(isReady(url, playlist, info, "live:testchannel")).toBe(false);
			vi.advanceTimersByTime(2000);
		}
	});

	it("does not transfer ad-end proof across playlist session URLs", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "vod";
		state.PageVodID = "2827992810";
		state.PageMediaKey = "vod:2827992810";
		state.CurrentAdMediaKey = "vod:2827992810";
		state.AdEndMinCleanPlaylists = 3;
		state.AdEndGraceMs = 500;
		state.AdPodProgressByMediaKey = {
			"vod:2827992810": { cycleStartedAt: 90000 },
		};
		getRecoveryState({ MediaKey: "vod:2827992810" }).phase = "exhausted";
		const adSessionUrl =
			"https://vod-secure.twitch.tv/archive/2827992810/index.m3u8?session=ad";
		const freshSessionUrl =
			"https://vod-secure.twitch.tv/archive/2827992810/index.m3u8?session=fresh";
		confirmPlaybackOwner("vod:2827992810", adSessionUrl, "avc1.64002A", 90000);
		const info: Record<string, unknown> = {};

		for (let i = 0; i < 20; i++) {
			const playlist = [
				"#EXTM3U",
				"#EXT-X-MEDIA-SEQUENCE:0",
				"#EXTINF:10.000,",
				"native.ts",
				"#EXT-X-ENDLIST",
			].join("\n");
			expect(isReady(freshSessionUrl, playlist, info, "vod:2827992810")).toBe(
				false,
			);
			vi.advanceTimersByTime(2000);
		}
	});

	it("keeps terminal recovery closed while the declared ad pod is incomplete", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const getRecoveryState = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerRecoveryState");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdEndMinCleanPlaylists = 3;
		state.AdEndGraceMs = 500;
		state.AdPodProgressByMediaKey = {
			"live:testchannel": {
				cycleStartedAt: 90000,
				adIds: ["stitched-ad-1"],
				expectedPodLength: 3,
			},
		};
		getRecoveryState({ MediaKey: "live:testchannel" }).phase = "exhausted";
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/incomplete.m3u8?session=ad";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000);
		const info: Record<string, unknown> = {};

		for (let i = 0; i < 20; i++) {
			const playlist = [
				"#EXTM3U",
				`#EXT-X-MEDIA-SEQUENCE:${800 + i}`,
				"#EXTINF:2.000,",
				"native.ts",
			].join("\n");
			expect(isReady(url, playlist, info, "live:testchannel")).toBe(false);
			vi.advanceTimersByTime(2000);
		}
	});

	it("uses terminal pod position to complete fallback recovery with missing ad IDs", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdPodProgressByMediaKey: {
				"live:testchannel": {
					cycleStartedAt: 90000,
					adIds: ["stitched-ad-1"],
					expectedPodLength: 4,
					maxAdPodPosition: 4,
					observedZeroAdPodPosition: false,
					updatedAt: 100000,
				},
			},
		});
		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({ MediaKey: "live:testchannel" }).phase = "exhausted";
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/terminal-position.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000);
		const info: Record<string, unknown> = {};
		let ready = false;
		for (let index = 0; index < 8; index++) {
			vi.setSystemTime(100000 + index * 2000);
			ready = isReady(
				url,
				[
					"#EXTM3U",
					`#EXT-X-MEDIA-SEQUENCE:${800 + index}`,
					"#EXTINF:2.000,",
					"native.ts",
				].join("\n"),
				info,
				"live:testchannel",
			);
		}
		expect(ready).toBe(true);
	});

	it("restarts the 90-second incomplete-pod escape at the latest progress marker", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const progress = {
			cycleStartedAt: 90000,
			adIds: ["stitched-ad-1"],
			expectedPodLength: 4,
			maxAdPodPosition: 1,
			observedZeroAdPodPosition: false,
			updatedAt: 100000,
		};
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdEndBackupHoldMaxMs: 90000,
			AdPodProgressByMediaKey: { "live:testchannel": progress },
		});
		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({ MediaKey: "live:testchannel" }).phase = "exhausted";
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/bounded-incomplete.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 90000);
		const info: Record<string, unknown> = {};
		let sequence = 900;
		const check = () =>
			isReady(
				url,
				[
					"#EXTM3U",
					`#EXT-X-MEDIA-SEQUENCE:${sequence++}`,
					"#EXTINF:2.000,",
					"native.ts",
				].join("\n"),
				info,
				"live:testchannel",
			);

		for (let index = 0; index < 7; index++) {
			vi.setSystemTime(100000 + index * 2000);
			expect(check()).toBe(false);
		}
		vi.setSystemTime(189999);
		expect(check()).toBe(false);

		progress.updatedAt = 189999;
		expect(check()).toBe(false);
		for (let index = 1; index <= 6; index++) {
			vi.setSystemTime(189999 + index * 2000);
			expect(check()).toBe(false);
		}
		vi.setSystemTime(279998);
		expect(check()).toBe(false);
		vi.setSystemTime(279999);
		expect(check()).toBe(true);
	});

	it("requires VOD endlist proof for the bounded incomplete-pod escape", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const isReady = T<
			(
				url: string,
				text: string,
				info: Record<string, unknown>,
				mediaKey: string,
			) => boolean
		>("_isPageSideFallbackRecoveryReady");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "vod",
			PageChannel: null,
			PageVodID: "2827992810",
			PageMediaKey: "vod:2827992810",
			CurrentAdMediaKey: "vod:2827992810",
			AdEndMinCleanPlaylists: 3,
			AdEndGraceMs: 500,
			AdEndBackupHoldMaxMs: 90000,
			AdPodProgressByMediaKey: {
				"vod:2827992810": {
					cycleStartedAt: 90000,
					adIds: ["stitched-ad-1"],
					expectedPodLength: 4,
					updatedAt: 100000,
				},
			},
		});
		T<(context: Record<string, unknown>) => Record<string, unknown>>(
			"_getWorkerRecoveryState",
		)({ MediaKey: "vod:2827992810" }).phase = "exhausted";
		const url =
			"https://vod-secure.twitch.tv/archive/2827992810/index.m3u8?session=bounded";
		confirmPlaybackOwner("vod:2827992810", url, "avc1.64002A", 90000);
		const info: Record<string, unknown> = {};
		const playlist = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:0",
			"#EXTINF:10.000,",
			"native.ts",
		];
		for (let index = 0; index < 7; index++) {
			vi.setSystemTime(100000 + index * 2000);
			expect(isReady(url, playlist.join("\n"), info, "vod:2827992810")).toBe(
				false,
			);
		}
		vi.setSystemTime(190000);
		expect(isReady(url, playlist.join("\n"), info, "vod:2827992810")).toBe(
			false,
		);
		for (let index = 0; index < 7; index++) {
			vi.setSystemTime(190000 + index * 2000);
			expect(
				isReady(
					url,
					[...playlist, "#EXT-X-ENDLIST"].join("\n"),
					info,
					"vod:2827992810",
				),
			).toBe(index === 6);
		}
	});

	it("keeps degraded ad-pod ownership current without double-counting the break", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const ensureCycle = T<
			(url: string, codec: string, playlist: string) => number
		>("_ensurePageSideFallbackAdCycle");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousRememberPlayback = g._rememberPlayerPlaybackForAd;
		const previousEnsureMonitors = g._ensurePlaybackMonitorsRunning;
		const previousClearTimeouts = g._clearPlaybackRecoveryTimeoutsForContext;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdChannel = null;
		state.CurrentAdMediaKey = null;
		state.AdPodProgressByMediaKey = Object.create(null);
		state.StreamInfos = Object.create(null);
		g._rememberPlayerPlaybackForAd = vi.fn();
		g._ensurePlaybackMonitorsRunning = vi.fn();
		g._clearPlaybackRecoveryTimeoutsForContext = vi.fn();
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/degraded-pod.m3u8";
		confirmPlaybackOwner("live:testchannel", url, "avc1.64002A");
		const playlistFor = (id: number) =>
			[
				"#EXTM3U",
				`#EXT-X-DATERANGE:ID="stitched-ad-${id}",X-TV-TWITCH-AD-POD-LENGTH="2",X-TV-TWITCH-AD-POD-POSITION="${id}"`,
				"#EXTINF:15.000,",
				`ad-${id}.ts`,
			].join("\n");

		try {
			const firstCycle = ensureCycle(url, "avc1.64002A", playlistFor(1));
			const secondCycle = ensureCycle(url, "avc1.64002A", playlistFor(2));
			const progress = (
				state.AdPodProgressByMediaKey as Record<
					string,
					{
						adIds: string[];
						expectedPodLength: number;
						maxAdPodPosition: number;
					}
				>
			)["live:testchannel"];

			expect(secondCycle).toBe(firstCycle);
			expect(progress.adIds).toEqual(["stitched-ad-1", "stitched-ad-2"]);
			expect(progress.expectedPodLength).toBe(2);
			expect(progress.maxAdPodPosition).toBe(2);
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(1);
			expect(g._clearPlaybackRecoveryTimeoutsForContext).toHaveBeenCalledTimes(
				1,
			);
			expect(g._clearPlaybackRecoveryTimeoutsForContext).toHaveBeenCalledWith(
				"live:testchannel",
			);
		} finally {
			g._rememberPlayerPlaybackForAd = previousRememberPlayback;
			g._ensurePlaybackMonitorsRunning = previousEnsureMonitors;
			g._clearPlaybackRecoveryTimeoutsForContext = previousClearTimeouts;
		}
	});

	it("passes through degraded playlists and segments after disabling mid-cycle", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/degraded-toggle.m3u8";
		const adSegmentUrl = "https://edge.example/adsquared/ad-700.ts";
		const emptyHoldSegmentUrl =
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4";
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:700",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			adSegmentUrl,
		].join("\n");
		const cleanPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:701",
			"#EXTINF:2.000,",
			"https://edge.example/live-701.ts",
		].join("\n");
		let currentPlaylist = adPlaylist;
		const rawFetch = vi.fn(async (input: unknown) => {
			const url = input instanceof Request ? input.url : String(input);
			return new Response(
				url === mediaUrl ? currentPlaylist : `native:${url}`,
				{ status: 200 },
			);
		});
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			IsAdStrippingEnabled: true,
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
		});
		(g._S as { adsBlocked: number }).adsBlocked = 0;
		confirmPlaybackOwner("live:testchannel", mediaUrl, "avc1.64002A");

		try {
			install();
			const blocked = await (await window.fetch(mediaUrl)).text();
			expect(blocked).not.toContain(adSegmentUrl);
			expect(blocked).toContain("__ttvab_empty_hold_segment.mp4");
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(1);

			state.IsAdStrippingEnabled = false;
			currentPlaylist = cleanPlaylist;
			expect(await (await window.fetch(mediaUrl)).text()).toBe(cleanPlaylist);
			expect(await (await window.fetch(adSegmentUrl)).text()).toBe(
				`native:${adSegmentUrl}`,
			);
			expect(await (await window.fetch(emptyHoldSegmentUrl)).text()).toBe(
				`native:${emptyHoldSegmentUrl}`,
			);
			expect((g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).size).toBe(
				0,
			);
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(1);

			state.CurrentAdChannel = null;
			state.CurrentAdMediaKey = null;
			state.AdPodProgressByMediaKey = Object.create(null);
			currentPlaylist = adPlaylist;
			expect(await (await window.fetch(mediaUrl)).text()).toBe(adPlaylist);
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(
				(state.AdPodProgressByMediaKey as Record<string, unknown>)[
					"live:testchannel"
				],
			).toBeUndefined();
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(1);
		} finally {
			window.fetch = originalFetch;
			for (const key of Object.keys(state)) delete state[key];
			Object.assign(state, previousState);
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("does not mutate a degraded playlist when disabled during fetch", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/degraded-pending-toggle.m3u8";
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:800",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"https://edge.example/adsquared/ad-800.ts",
		].join("\n");
		let releaseFetch: ((response: Response) => void) | null = null;
		window.fetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					releaseFetch = resolve;
				}),
		) as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			IsAdStrippingEnabled: true,
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
		});
		(g._S as { adsBlocked: number }).adsBlocked = 0;
		confirmPlaybackOwner("live:testchannel", mediaUrl, "avc1.64002A");

		try {
			install();
			const pending = window.fetch(mediaUrl);
			state.IsAdStrippingEnabled = false;
			releaseFetch?.(new Response(playlist, { status: 200 }));
			expect(await (await pending).text()).toBe(playlist);
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(
				(state.AdPodProgressByMediaKey as Record<string, unknown>)[
					"live:testchannel"
				],
			).toBeUndefined();
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(0);
		} finally {
			window.fetch = originalFetch;
			for (const key of Object.keys(state)) delete state[key];
			Object.assign(state, previousState);
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("does not let an unproven auxiliary playlist claim or leak an ad cycle", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const previousState = { ...state };
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"https://edge.example/adsquared/ad-500.ts",
		].join("\n");
		window.fetch = vi.fn(
			async () => new Response(playlist, { status: 200 }),
		) as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			AdPodProgressByMediaKey: Object.create(null),
			StreamInfos: Object.create(null),
		});
		(g._S as { adsBlocked: number }).adsBlocked = 0;
		const auxiliaryUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/auxiliary.m3u8";
		const ownedUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/owned.m3u8";

		try {
			install();
			await expect(window.fetch(auxiliaryUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(state.CurrentAdMediaKey).toBeNull();
			expect(
				(state.AdPodProgressByMediaKey as Record<string, unknown>)[
					"live:testchannel"
				],
			).toBeUndefined();
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(0);

			confirmPlaybackOwner("live:testchannel", ownedUrl, "avc1.64002A");
			const blocked = await (await window.fetch(ownedUrl)).text();
			expect(blocked).not.toContain("adsquared");
			expect(blocked).toContain("__ttvab_empty_hold_segment.mp4");
			expect(state.CurrentAdMediaKey).toBe("live:testchannel");
			expect((g._S as { adsBlocked: number }).adsBlocked).toBe(1);
		} finally {
			window.fetch = originalFetch;
			for (const key of Object.keys(state)) delete state[key];
			Object.assign(state, previousState);
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("blocks markerless ad segments and LL-HLS parts in degraded mode", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const playlist = [
			"#EXTM3U",
			"#EXT-X-VERSION:9",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:300",
			"#EXTINF:2.000,",
			"https://edge.example/_404/ad-300.ts",
			'#EXT-X-PART:DURATION=0.333,URI="https://edge.example/adsquared/ad-301.m4s"',
			'#EXT-X-PRELOAD-HINT:TYPE=PART,URI="https://edge.example/_404/ad-302.m4s"',
		].join("\n");
		const rawFetch = vi.fn(async () => new Response(playlist, { status: 200 }));
		const variantCodecByUrl = g._pageSideVariantCodecByUrl as Map<
			string,
			string
		>;
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
		variantCodecByUrl.clear();

		try {
			install();
			const url =
				"https://video-weaver.example.ttvnw.net/v1/playlist/live.m3u8";
			T<(text: string, baseUrl: string) => boolean>(
				"_rememberPageSideVariantCodecs",
			)(
				[
					"#EXTM3U",
					'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"',
					url,
				].join("\n"),
				"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
			);
			confirmPlaybackOwner("live:testchannel", url, "avc1.64002A", 0);
			const first = await (await window.fetch(url)).text();
			const second = await (await window.fetch(url)).text();
			for (const output of [first, second]) {
				expect(output).not.toContain("/_404/");
				expect(output).not.toContain("/adsquared/");
				expect(output).not.toContain("#EXT-X-PART:");
				expect(output).not.toContain("#EXT-X-PRELOAD-HINT:");
				const lines = output.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (!lines[i]?.startsWith("#EXTINF")) continue;
					expect(lines[i + 1]).toBeTruthy();
					expect(lines[i + 1]?.startsWith("#")).toBe(false);
				}
			}
			expect(first).toContain("__ttvab_empty_hold_segment.mp4");
			expect(first).toContain("#EXT-X-MEDIA-SEQUENCE:301");
			expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:302");
			expect(rawFetch).toHaveBeenCalledTimes(2);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it.each(["hevc", "av1", null])(
		"aborts an all-ad degraded playlist whose rendition codec is %s",
		async (codecFamily) => {
			const install = T<() => void>("_installPageSideM3U8Override");
			const scopedWindow = window as unknown as Record<string, unknown>;
			const originalFetch = window.fetch;
			const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
			const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			const playlist = [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:410",
				"#EXTINF:2.000,",
				"https://edge.example/_404/ad-410.ts",
			].join("\n");
			const rawFetch = vi.fn(
				async () => new Response(playlist, { status: 200 }),
			);
			const url = `https://video-weaver.example.ttvnw.net/v1/playlist/${
				codecFamily || "unknown"
			}-live.m3u8`;
			const variantCodecByUrl = g._pageSideVariantCodecByUrl as Map<
				string,
				string
			>;
			window.fetch = rawFetch as typeof fetch;
			scopedWindow.__TTVAB_REAL_FETCH__ = null;
			scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
			(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
			variantCodecByUrl.clear();
			if (codecFamily) {
				const codec =
					codecFamily === "hevc" ? "hev1.1.6.L153.B0" : "av01.0.13M.08";
				T<(text: string, baseUrl: string) => boolean>(
					"_rememberPageSideVariantCodecs",
				)(
					[
						"#EXTM3U",
						`#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,CODECS="${codec},mp4a.40.2"`,
						url,
					].join("\n"),
					"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
				);
			}

			try {
				install();
				await expect(window.fetch(url)).rejects.toMatchObject({
					name: "AbortError",
				});
				expect(rawFetch).toHaveBeenCalledOnce();
			} finally {
				window.fetch = originalFetch;
				variantCodecByUrl.clear();
				if (originalRealFetch === undefined) {
					delete scopedWindow.__TTVAB_REAL_FETCH__;
				} else {
					scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
				}
				if (originalFallbackActive === undefined) {
					delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
				} else {
					scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
				}
			}
		},
	);

	it("does not refetch raw media when degraded inspection throws", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const response = new Response("#EXTM3U", { status: 200 });
		vi.spyOn(response, "clone").mockReturnValue({
			text: async () => {
				throw new Error("body inspection failed");
			},
		} as Response);
		const rawFetch = vi.fn(async () => response);
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;

		try {
			install();
			await expect(
				window.fetch(
					"https://video-weaver.example.ttvnw.net/v1/playlist/live.m3u8",
				),
			).rejects.toThrow("body inspection failed");
			expect(rawFetch).toHaveBeenCalledTimes(1);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("cycle-fences delayed post-ad artifact cleanup", () => {
		vi.useFakeTimers();
		const schedule = T<
			(channel: string, mediaKey: string, cycleStartedAt: number) => unknown
		>("_schedulePostAdArtifactCleanup");
		const previousRunCleanup = g._runPostAdArtifactCleanup;
		const previousRecoveryContext = g._isPlaybackRecoveryContextCurrent;
		const previousCycleCurrent = g._isCodecHandoffCycleCurrent;
		const runCleanup = vi.fn();
		g._runPostAdArtifactCleanup = runCleanup;
		g._isPlaybackRecoveryContextCurrent = () => true;
		g._isCodecHandoffCycleCurrent = (_mediaKey: string, cycle: number) =>
			cycle === 200;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;

		try {
			schedule("testchannel", "live:testchannel", 100);
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 200 },
			};
			vi.advanceTimersByTime(80);

			expect(runCleanup).not.toHaveBeenCalled();
		} finally {
			if (previousRunCleanup === undefined) delete g._runPostAdArtifactCleanup;
			else g._runPostAdArtifactCleanup = previousRunCleanup;
			if (previousRecoveryContext === undefined) {
				delete g._isPlaybackRecoveryContextCurrent;
			} else {
				g._isPlaybackRecoveryContextCurrent = previousRecoveryContext;
			}
			if (previousCycleCurrent === undefined) {
				delete g._isCodecHandoffCycleCurrent;
			} else {
				g._isCodecHandoffCycleCurrent = previousCycleCurrent;
			}
		}
	});

	it("accepts lifecycle acknowledgements only for the current same-media cycle", () => {
		const isLifecycleCycleCurrent = T<
			(mediaKey: string, cycleStartedAt: number) => boolean
		>("_isPageLifecycleCycleCurrent");
		const previousCycleCurrent = g._isCodecHandoffCycleCurrent;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 200 },
		};
		g._isCodecHandoffCycleCurrent = (mediaKey: string, cycle: number) =>
			mediaKey === "live:testchannel" && cycle === 200;

		try {
			expect(isLifecycleCycleCurrent("live:testchannel", 100)).toBe(false);
			expect(isLifecycleCycleCurrent("live:testchannel", 200)).toBe(true);
		} finally {
			if (previousCycleCurrent === undefined) {
				delete g._isCodecHandoffCycleCurrent;
			} else {
				g._isCodecHandoffCycleCurrent = previousCycleCurrent;
			}
		}
	});
});

describe("worker mixed-codec master selection", () => {
	it("deduplicates exact media-bootstrap recovery requests per ad cycle", () => {
		const originalFetch = g.fetch;
		const originalPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 1234 },
			},
		});
		g.fetch = vi.fn();
		const report = vi.fn();
		g._postWorkerBridgeMessage = report;

		try {
			T<() => void>("_hookWorkerFetch")();
			const requestRecovery = state.RequestMediaBootstrapRecovery as (
				context: Record<string, unknown>,
				cycleStartedAt: number,
			) => boolean;
			expect(
				requestRecovery(
					{ MediaType: "live", ChannelName: "testchannel" },
					1234,
				),
			).toBe(true);
			expect(
				requestRecovery(
					{ MediaType: "live", ChannelName: "testchannel" },
					1234,
				),
			).toBe(false);
			expect(report).toHaveBeenCalledOnce();
			expect(report.mock.calls[0]?.[1]).toMatchObject({
				key: "MediaBootstrapRecoveryNeeded",
				mediaKey: "live:testchannel",
				cycleStartedAt: 1234,
			});
		} finally {
			g.fetch = originalFetch;
			g._postWorkerBridgeMessage = originalPostWorkerBridgeMessage;
		}
	});

	it("reports media ownership only after a successful usable response", async () => {
		const originalFetch = g.fetch;
		const originalPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		const variantUrl = "https://edge.example/1080p/index.m3u8";
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"',
			variantUrl,
		].join("\n");
		let mediaAttempt = 0;
		const rawFetch = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes("usher.ttvnw.net")) {
				return new Response(master, { status: 200 });
			}
			mediaAttempt++;
			if (mediaAttempt === 1) {
				return new Response("unavailable", { status: 503 });
			}
			throw new Error("media network failure");
		});
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		const report = vi.fn();
		g._postWorkerBridgeMessage = report;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await (g.fetch as typeof fetch)(usherUrl);
			expect(
				report.mock.calls.filter(
					([, message]) =>
						(message as Record<string, unknown>)?.key ===
						"PlaybackWorkerBootstrapObserved",
				),
			).toHaveLength(1);
			await expect(
				(g.fetch as typeof fetch)(variantUrl),
			).resolves.toMatchObject({
				status: 503,
			});
			await expect((g.fetch as typeof fetch)(variantUrl)).rejects.toThrow(
				"media network failure",
			);
			expect(
				report.mock.calls.filter(
					([, message]) =>
						(message as Record<string, unknown>)?.key ===
						"PlaybackWorkerObserved",
				),
			).toHaveLength(0);
		} finally {
			g.fetch = originalFetch;
			g._postWorkerBridgeMessage = originalPostWorkerBridgeMessage;
		}
	});

	it("keeps playlist fetches alive when ownership reporting fails and retries the report", async () => {
		const originalFetch = g.fetch;
		const originalPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		const variantUrl = "https://edge.example/1080p/index.m3u8";
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"',
			variantUrl,
		].join("\n");
		const media = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:1",
			"#EXTINF:2.000,",
			"https://edge.example/1080p/1.ts",
		].join("\n");
		const rawFetch = vi.fn(
			async (input: RequestInfo | URL) =>
				new Response(
					String(input).includes("usher.ttvnw.net") ? master : media,
					{
						status: 200,
					},
				),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		g._postWorkerBridgeMessage = () => {
			throw new Error("worker closing");
		};
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await (g.fetch as typeof fetch)(usherUrl);
			await expect(
				(g.fetch as typeof fetch)(variantUrl).then((response) =>
					response.text(),
				),
			).resolves.toBe(media);

			const report = vi.fn();
			g._postWorkerBridgeMessage = report;
			await (g.fetch as typeof fetch)(variantUrl);
			await (g.fetch as typeof fetch)(variantUrl);
			expect(report).toHaveBeenCalledOnce();
			expect(report.mock.calls[0]?.[1]).toMatchObject({
				key: "PlaybackWorkerObserved",
				mediaKey: "live:testchannel",
				playlistUrl: variantUrl,
				codec: "avc1.64002a",
			});
			expect(rawFetch).toHaveBeenCalledTimes(4);
		} finally {
			g.fetch = originalFetch;
			g._postWorkerBridgeMessage = originalPostWorkerBridgeMessage;
		}
	});

	it("owns Twitch's current VOD master and passes clean archive media through", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const originalFetch = g.fetch;
		const originalPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		const variantUrl =
			"https://vod-secure.twitch.tv/archive/2827992810/1080p/index-dvr.m3u8";
		const master = [
			"#EXTM3U",
			'#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="1785600000.000"',
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"',
			variantUrl,
		].join("\n");
		const media = [
			"#EXTM3U",
			"#EXT-X-PLAYLIST-TYPE:EVENT",
			"#EXT-X-TARGETDURATION:10",
			"#EXT-X-MEDIA-SEQUENCE:0",
			"#EXTINF:10.000,",
			"https://vod-secure.twitch.tv/archive/2827992810/1080p/0.ts",
			"#EXT-X-ENDLIST",
		].join("\n");
		const rawFetch = vi.fn(
			async (input: RequestInfo | URL) =>
				new Response(String(input).includes("/vod/v2/") ? master : media, {
					status: 200,
				}),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "vod";
		state.PageChannel = null;
		state.PageVodID = "2827992810";
		state.PageMediaKey = "vod:2827992810";
		state.IsAdStrippingEnabled = true;
		g.fetch = rawFetch;
		const report = vi.fn();
		g._postWorkerBridgeMessage = report;
		const usherUrl =
			"https://usher.ttvnw.net/vod/v2/2827992810.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const masterOutput = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["vod:2827992810"];

			expect(masterOutput).toBe(master);
			expect(state.V2API).toBe(true);
			expect(T<(text: string) => string | null>("_getServerTime")(master)).toBe(
				"1785600000.000",
			);
			expect(info.MediaType).toBe("vod");
			expect(info.ChannelName).toBe(null);
			expect(info.VodID).toBe("2827992810");
			expect(
				(state.StreamInfosByUrl as Record<string, unknown>)[variantUrl],
			).toBe(info);

			const mediaOutput = await (
				await (g.fetch as typeof fetch)(variantUrl)
			).text();
			expect(mediaOutput).toContain("/1080p/0.ts");
			expect(mediaOutput).not.toContain("__ttvab_empty_hold_segment.mp4");
			expect(
				report.mock.calls.filter(
					([, message]) =>
						(message as Record<string, unknown>)?.key ===
						"PlaybackWorkerObserved",
				),
			).toHaveLength(1);
			vi.setSystemTime(106000);
			await (g.fetch as typeof fetch)(
				"https://vod-secure.twitch.tv/archive/2827992810/1080p/0.ts",
			);
			expect(
				report.mock.calls.filter(
					([, message]) =>
						(message as Record<string, unknown>)?.key ===
						"PlaybackWorkerObserved",
				),
			).toHaveLength(2);
			expect(rawFetch).toHaveBeenCalledTimes(3);
		} finally {
			g.fetch = originalFetch;
			g._postWorkerBridgeMessage = originalPostWorkerBridgeMessage;
		}
	});

	it("keeps 1440p HEVC/AV1 selectable normally and filters only for an exact current handoff", async () => {
		const originalFetch = g.fetch;
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60-hevc"',
			"https://edge.example/1440-hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=14000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="av01.0.13M.08,mp4a.40.2",VIDEO="1440p60-av1"',
			"https://edge.example/1440-av1/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002A,mp4a.40.2",VIDEO="1080p60"',
			"https://edge.example/1080-avc/index.m3u8",
		].join("\n");
		const rawFetch = vi.fn(async () => new Response(master, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.IsAdStrippingEnabled = true;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const normalMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["live:testchannel"];

			expect(normalMaster).toContain("2560x1440");
			expect(normalMaster).toContain("1440-hevc/index.m3u8");
			expect(normalMaster).toContain("1440-av1/index.m3u8");
			expect(info.ModifiedM3U8).not.toContain("2560x1440");
			expect(info.IsUsingModifiedM3U8).toBe(false);
			info.EnhancedDecoderCodecFamily = "hevc";
			info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";

			const cycleStartedAt = 100;
			const handoffId = "live:testchannel:100:1000:1:exact-current-handoff";
			info.IsShowingAd = true;
			info.VisibleAdStartedAt = cycleStartedAt;
			info._CodecHandoffPendingId = handoffId;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt },
			};
			state.ActiveCodecHandoffId = handoffId;
			state.ActiveCodecHandoffChannel = "testchannel";
			state.ActiveCodecHandoffMediaKey = "live:testchannel";

			const handoffMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			expect(handoffMaster).not.toContain("2560x1440");
			expect(handoffMaster).not.toContain("1440-hevc/index.m3u8");
			expect(handoffMaster).not.toContain("1440-av1/index.m3u8");
			expect(handoffMaster).toContain("1080-avc/index.m3u8");
			expect(info.IsUsingModifiedM3U8).toBe(true);
			expect(info.EnhancedDecoderCodecFamily).toBe(null);
			expect(info.EnhancedDecoderCodec).toBe(null);
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("keeps an exact Previews player on AVC before a preroll can force a decoder reload", async () => {
		const originalFetch = g.fetch;
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60-hevc"',
			"https://edge.example/1440-hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=14000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="av01.0.13M.08,mp4a.40.2",VIDEO="1440p60-av1"',
			"https://edge.example/1440-av1/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002A,mp4a.40.2",VIDEO="1080p60"',
			"https://edge.example/1080-avc/index.m3u8",
		].join("\n");
		let nextMaster = master;
		const rawFetch = vi.fn(
			async () => new Response(nextMaster, { status: 200 }),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.IsAdStrippingEnabled = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const previewMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["live:testchannel"];

			expect(previewMaster).not.toContain("1440-hevc/index.m3u8");
			expect(previewMaster).not.toContain("1440-av1/index.m3u8");
			expect(previewMaster).toContain("1080-avc/index.m3u8");
			expect(info.IsUsingModifiedM3U8).toBe(false);
			expect(state.CurrentAdMediaKey).toBe(null);

			nextMaster = master.split("\n").slice(0, 5).join("\n");
			const enhancedOnlyMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			expect(enhancedOnlyMaster).toBe(nextMaster);
			expect(info.ModifiedM3U8).toBe(null);
			expect(info.IsUsingModifiedM3U8).toBe(false);

			nextMaster = master;
			state.IsAdStrippingEnabled = false;
			const disabledMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			expect(disabledMaster).toBe(master);
			expect(info.IsUsingModifiedM3U8).toBe(false);
			expect(rawFetch).toHaveBeenCalledTimes(3);
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("retries the exact native Previews master once after a pre-byte fetch rejection", async () => {
		const originalFetch = g.fetch;
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.7654321);
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60-hevc"',
			"https://edge.example/1440-hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002A,mp4a.40.2",VIDEO="1080p60"',
			"https://edge.example/1080-avc/index.m3u8",
		].join("\n");
		const rawFetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValueOnce(new Response(master, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.IsAdStrippingEnabled = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const output = await (await (g.fetch as typeof fetch)(usherUrl)).text();
			const retryUrl = new URL(String(rawFetch.mock.calls[1]?.[0]));
			const retryOptions = rawFetch.mock.calls[1]?.[1] as RequestInit;

			expect(rawFetch).toHaveBeenCalledTimes(2);
			expect(retryUrl.searchParams.get("p")).toBe(
				String(Math.floor(0.7654321 * 10000000)),
			);
			expect(retryUrl.searchParams.get("p")).not.toBe("1234567");
			expect(retryUrl.searchParams.get("sig")).toBe("test");
			expect(retryUrl.searchParams.get("token")).toBe("test");
			expect(retryOptions.cache).toBe("no-store");
			expect(output).not.toContain("1440-hevc/index.m3u8");
			expect(output).toContain("1080-avc/index.m3u8");
		} finally {
			g.fetch = originalFetch;
			randomSpy.mockRestore();
		}
	});

	it("recovers a twice-rejected Previews master only after a sequential clean media validation", async () => {
		const originalFetch = g.fetch;
		const originalGetToken = g._getToken;
		const originalExtract = g._extractPlaybackAccessToken;
		const originalPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		const retryError = new TypeError("Failed to fetch after retry");
		const tokenCalls: string[] = [];
		const report = vi.fn();
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:1",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"https://embed.example/stitched-ad-1.ts",
		].join("\n");
		const cleanPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:10",
			"#EXTINF:2.000,",
			"https://autoplay.example/live-10.ts",
		].join("\n");
		const backupMaster = (type: string) =>
			[
				"#EXTM3U",
				`#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${type}-hevc",NAME="1440p"`,
				`#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="${type}-hevc"`,
				`https://${type}.example/hevc.m3u8`,
				`#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${type}-360",NAME="360p"`,
				`#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=640x360,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="${type}-360"`,
				`https://${type}.example/avc.m3u8`,
				`#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${type}-160",NAME="160p"`,
				`#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="${type}-160"`,
				`https://${type}.example/unvalidated-avc.m3u8`,
			].join("\n");
		let nativeAttempts = 0;
		let autoplayMediaAttempts = 0;
		const rawFetch = vi.fn(async (input: RequestInfo | URL) => {
			const href =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (href.includes("sig=test")) {
				nativeAttempts++;
				throw nativeAttempts === 1
					? new TypeError("Failed to fetch")
					: retryError;
			}
			if (href.includes("sig=embed-sig")) {
				return new Response(backupMaster("embed"), { status: 200 });
			}
			if (href.includes("sig=autoplay-sig")) {
				return new Response(backupMaster("autoplay"), { status: 200 });
			}
			if (href === "https://embed.example/avc.m3u8") {
				return new Response(adPlaylist, { status: 200 });
			}
			if (href === "https://autoplay.example/avc.m3u8") {
				autoplayMediaAttempts++;
				return new Response(cleanPlaylist, { status: 200 });
			}
			if (href.includes("unvalidated-avc.m3u8")) {
				throw new Error("unselected rendition must not be fetched");
			}
			return new Response(null, { status: 404 });
		});
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			IsAdStrippingEnabled: true,
			AllowPreviewEmergencyAutoplayBackup: true,
			DisableAutoplayBackup: true,
			BackupPlayerTypes: ["embed", "autoplay"],
		});
		g._getToken = async (_info: unknown, playerType: string) => {
			tokenCalls.push(playerType);
			return new Response(
				JSON.stringify({
					signature: `${playerType}-sig`,
					value: `${playerType}-token`,
				}),
				{ status: 200 },
			);
		};
		g._extractPlaybackAccessToken = (payload: unknown) => payload;
		g.fetch = rawFetch;
		g._postWorkerBridgeMessage = report;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const master = await (await (g.fetch as typeof fetch)(usherUrl)).text();
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["live:testchannel"];

			expect(nativeAttempts).toBe(2);
			expect(tokenCalls).toEqual(["embed", "autoplay"]);
			expect(master).toContain("https://autoplay.example/avc.m3u8");
			expect(master).not.toContain("autoplay.example/hevc.m3u8");
			expect(master).not.toContain("unvalidated-avc.m3u8");
			expect(master).toContain('GROUP-ID="autoplay-360"');
			expect(master).not.toContain('GROUP-ID="autoplay-160"');
			expect(master).not.toContain("embed.example");
			expect(info.LastCleanBackupPlayerType).toBe("autoplay");
			expect(info.LastCleanBackupM3U8).toBe(cleanPlaylist);
			expect(info.ActiveBackupPlayerType).toBe("autoplay");
			expect(info.IsUsingModifiedM3U8).toBe(false);
			expect(state.CurrentAdMediaKey).toBe(null);
			expect(
				report.mock.calls.filter(
					([, message]) =>
						(message as Record<string, unknown>)?.key ===
						"PlaybackWorkerBootstrapObserved",
				),
			).toHaveLength(1);
			await expect(
				(g.fetch as typeof fetch)("https://autoplay.example/avc.m3u8").then(
					(response) => response.text(),
				),
			).resolves.toBe(cleanPlaylist);
			expect(autoplayMediaAttempts).toBe(2);
		} finally {
			g.fetch = originalFetch;
			g._getToken = originalGetToken;
			g._extractPlaybackAccessToken = originalExtract;
			g._postWorkerBridgeMessage = originalPostWorkerBridgeMessage;
		}
	});

	it("bounds a stalled Previews fallback sweep and cools down immediate retries", async () => {
		vi.useFakeTimers({ now: 100_000 });
		const originalFetch = g.fetch;
		const originalGetToken = g._getToken;
		const retryError = new TypeError("Failed to fetch after retry");
		let nativeAttempts = 0;
		const rawFetch = vi.fn(async () => {
			nativeAttempts++;
			if (nativeAttempts % 2 === 1) {
				throw new TypeError("Failed to fetch");
			}
			throw retryError;
		});
		const getToken = vi.fn(() => new Promise(() => {}));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			IsAdStrippingEnabled: true,
			AllowPreviewEmergencyAutoplayBackup: true,
			DisableAutoplayBackup: true,
			BackupPlayerTypes: ["embed", "autoplay"],
		});
		g._getToken = getToken;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const firstRequest = expect(
				(g.fetch as typeof fetch)(usherUrl),
			).rejects.toBe(retryError);
			await vi.advanceTimersByTimeAsync(5000);
			await firstRequest;
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["live:testchannel"];

			expect(getToken).toHaveBeenCalledOnce();
			expect(info._BackupSearchPromise).toBe(null);
			expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
			expect(Number(info._PreviewMasterFallbackRetryAt)).toBe(115_000);

			await expect((g.fetch as typeof fetch)(usherUrl)).rejects.toBe(
				retryError,
			);
			expect(getToken).toHaveBeenCalledOnce();
			expect(nativeAttempts).toBe(4);
		} finally {
			g.fetch = originalFetch;
			g._getToken = originalGetToken;
			vi.useRealTimers();
		}
	});

	it("keeps a twice-rejected Previews master fail-closed when every validated source is ad-marked", async () => {
		const originalFetch = g.fetch;
		const originalGetToken = g._getToken;
		const originalExtract = g._extractPlaybackAccessToken;
		const retryError = new TypeError("Failed to fetch after retry");
		const tokenCalls: string[] = [];
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=640x360,CODECS="avc1.4D401F,mp4a.40.2"',
			"https://autoplay.example/avc.m3u8",
		].join("\n");
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"https://autoplay.example/stitched-ad-1.ts",
		].join("\n");
		let nativeAttempts = 0;
		const rawFetch = vi.fn(async (input: RequestInfo | URL) => {
			const href =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (href.includes("sig=test")) {
				nativeAttempts++;
				throw nativeAttempts === 1
					? new TypeError("Failed to fetch")
					: retryError;
			}
			if (href.includes("sig=autoplay-sig")) {
				return new Response(master, { status: 200 });
			}
			if (href === "https://autoplay.example/avc.m3u8") {
				return new Response(adPlaylist, { status: 200 });
			}
			return new Response(null, { status: 404 });
		});
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			IsAdStrippingEnabled: true,
			AllowPreviewEmergencyAutoplayBackup: true,
			DisableAutoplayBackup: true,
			BackupPlayerTypes: ["autoplay"],
		});
		g._getToken = async (_info: unknown, playerType: string) => {
			tokenCalls.push(playerType);
			return new Response(
				JSON.stringify({
					signature: `${playerType}-sig`,
					value: `${playerType}-token`,
				}),
				{ status: 200 },
			);
		};
		g._extractPlaybackAccessToken = (payload: unknown) => payload;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(usherUrl)).rejects.toBe(
				retryError,
			);
			expect(nativeAttempts).toBe(2);
			expect(tokenCalls).toEqual(["autoplay"]);
			expect(state.CurrentAdMediaKey).toBe(null);
		} finally {
			g.fetch = originalFetch;
			g._getToken = originalGetToken;
			g._extractPlaybackAccessToken = originalExtract;
		}
	});

	it("does not replace a twice-rejected Previews master under enhanced decoder ownership", async () => {
		const originalFetch = g.fetch;
		const originalGetToken = g._getToken;
		const retryError = new TypeError("Failed to fetch after retry");
		const getToken = vi.fn();
		const rawFetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockRejectedValueOnce(retryError);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			IsAdStrippingEnabled: true,
			AllowPreviewEmergencyAutoplayBackup: true,
		});
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.EnhancedDecoderCodecFamily = "hevc";
		(state.StreamInfos as Record<string, Record<string, unknown>>)[
			"live:testchannel"
		] = info;
		g._getToken = getToken;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(usherUrl)).rejects.toBe(
				retryError,
			);
			expect(rawFetch).toHaveBeenCalledTimes(2);
			expect(getToken).not.toHaveBeenCalled();
			expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		} finally {
			g.fetch = originalFetch;
			g._getToken = originalGetToken;
		}
	});

	it("does not start Preview master recovery after the retry is cancelled", async () => {
		const originalFetch = g.fetch;
		const originalGetToken = g._getToken;
		const cancelled = new DOMException("cancelled", "AbortError");
		const getToken = vi.fn();
		const rawFetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockRejectedValueOnce(cancelled);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		Object.assign(state, {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			IsAdStrippingEnabled: true,
			AllowPreviewEmergencyAutoplayBackup: true,
		});
		g._getToken = getToken;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(usherUrl)).rejects.toBe(cancelled);
			expect(rawFetch).toHaveBeenCalledTimes(2);
			expect(getToken).not.toHaveBeenCalled();
		} finally {
			g.fetch = originalFetch;
			g._getToken = originalGetToken;
		}
	});

	it.each([
		["an ordinary player", false, true, new TypeError("Failed to fetch")],
		["disabled blocking", true, false, new TypeError("Failed to fetch")],
		[
			"a cancelled Preview request",
			true,
			true,
			new DOMException("cancelled", "AbortError"),
		],
	])("does not retry %s", async (_name, isPreview, enabled, error) => {
		const originalFetch = g.fetch;
		const rawFetch = vi.fn().mockRejectedValue(error);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.IsAdStrippingEnabled = enabled;
		state.AllowPreviewEmergencyAutoplayBackup = isPreview;
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?p=1234567&sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(usherUrl)).rejects.toBe(error);
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});
});

describe("worker media-playlist exception fail-closed path", () => {
	it("processes the first ad-marked media response before settings resolve", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/startup-ad.m3u8";
		const nativePlaylist = "#EXTM3U\n#EXT-X-CUE-OUT:30\n#EXTINF:2,\nad.ts";
		const blockedPlaylist = "#EXTM3U\n#EXT-X-ENDLIST";
		const rawFetch = vi.fn(
			async () => new Response(nativePlaylist, { status: 200 }),
		);
		const process = vi.fn(async () => blockedPlaylist);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		g.fetch = rawFetch;
		g._processM3U8 = process;

		try {
			T<() => void>("_hookWorkerFetch")();
			const result = await (await (g.fetch as typeof fetch)(mediaUrl)).text();

			expect(state.IsAdStrippingEnabled).toBe(true);
			expect(result).toBe(blockedPlaylist);
			expect(process).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});

	it("returns the native response when disabled during the first media fetch", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/startup-disable.m3u8";
		const nativePlaylist = "#EXTM3U\n#EXT-X-CUE-OUT:30\n#EXTINF:2,\nad.ts";
		let finishFetch = (_response: Response) => {
			throw new Error("Fetch did not start");
		};
		const rawFetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finishFetch = resolve;
				}),
		);
		const process = vi.fn(async () => "#EXTM3U\n#EXT-X-ENDLIST");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		g.fetch = rawFetch;
		g._processM3U8 = process;

		try {
			T<() => void>("_hookWorkerFetch")();
			const pendingResponse = (g.fetch as typeof fetch)(mediaUrl);
			await vi.waitFor(() => expect(rawFetch).toHaveBeenCalledOnce());
			state.IsAdStrippingEnabled = false;
			finishFetch(new Response(nativePlaylist, { status: 200 }));

			const result = await (await pendingResponse).text();
			expect(result).toBe(nativePlaylist);
			expect(process).not.toHaveBeenCalled();
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});

	it.each([
		{ label: "finishes", reject: false },
		{ label: "aborts", reject: true },
	])(
		"returns native media when pending backup processing $label after disabling",
		async ({ reject }) => {
			const originalFetch = g.fetch;
			const originalProcess = g._processM3U8;
			const mediaUrl =
				"https://video-weaver.example.ttvnw.net/v1/playlist/pending-toggle.m3u8";
			const nativePlaylist = [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXT-X-CUE-OUT:30",
				"#EXTINF:2.000,",
				"ad-500.ts",
			].join("\n");
			T<(scope: Record<string, unknown>) => void>("_declareState")(g);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			const resolution = {
				Name: "1080p60",
				Resolution: "1920x1080",
				FrameRate: 60,
				Codecs: "avc1.64002A,mp4a.40.2",
			};
			const info = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_createStreamInfo")({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			info.IsShowingAd = true;
			info.VisibleAdStartedAt = 100;
			info.ResolutionList = [resolution];
			info.Urls = Object.create(null);
			for (const alias of T<(url: string) => string[]>(
				"_getPlaylistUrlAliases",
			)(mediaUrl)) {
				(info.Urls as Record<string, unknown>)[alias] = resolution;
				(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
			}
			(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
			state.IsAdStrippingEnabled = true;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 100 },
			};
			const rawFetch = vi.fn(
				async () => new Response(nativePlaylist, { status: 200 }),
			);
			const processStarted = vi.fn();
			let settleProcessing = (_reason: unknown) => {
				throw new Error("Processing did not start");
			};
			g.fetch = rawFetch;
			g._processM3U8 = () =>
				new Promise((resolve, rejectProcessing) => {
					processStarted();
					settleProcessing = reject ? rejectProcessing : resolve;
				});

			try {
				T<() => void>("_hookWorkerFetch")();
				const pendingResponse = (g.fetch as typeof fetch)(mediaUrl);
				await vi.waitFor(() => expect(processStarted).toHaveBeenCalledOnce());
				state.CurrentAdChannel = null;
				state.CurrentAdMediaKey = null;
				state.IsAdStrippingEnabled = false;
				settleProcessing(
					reject
						? new DOMException("Backup search ownership changed", "AbortError")
						: "#EXTM3U\n#EXT-X-ENDLIST",
				);

				const result = await (await pendingResponse).text();
				expect(result).toBe(nativePlaylist);
				expect(rawFetch).toHaveBeenCalledOnce();
				expect(rawFetch).toHaveBeenCalledWith(mediaUrl, undefined);
			} finally {
				g.fetch = originalFetch;
				g._processM3U8 = originalProcess;
			}
		},
	);

	it.each([
		{
			label: "HEVC",
			family: "hevc",
			codec: "hev1.1.6.L153.B0",
		},
		{
			label: "AV1",
			family: "av1",
			codec: "av01.0.13M.08",
		},
	])(
		"aborts an AVC empty hold while the $label decoder owns playback",
		async ({ family, codec }) => {
			const originalFetch = g.fetch;
			const rawFetch = vi.fn(async () => new Response(null, { status: 200 }));
			T<(scope: Record<string, unknown>) => void>("_declareState")(g);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			state.IsAdStrippingEnabled = true;
			const info = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_createStreamInfo")({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			info.EnhancedDecoderCodecFamily = family;
			info.EnhancedDecoderCodec = codec;
			state.StreamInfos = { "live:testchannel": info };
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			g.fetch = rawFetch;
			const emptyHoldUrl =
				"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1&media=live%3Atestchannel";

			try {
				T<() => void>("_hookWorkerFetch")();
				await expect(
					(g.fetch as typeof fetch)(emptyHoldUrl),
				).rejects.toMatchObject({
					name: "AbortError",
				});
				expect(rawFetch).not.toHaveBeenCalled();
			} finally {
				g.fetch = originalFetch;
			}
		},
	);

	it("keeps the AVC empty hold available after enhanced ownership clears", async () => {
		const originalFetch = g.fetch;
		const rawFetch = vi.fn(async () => new Response(null, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		state.StreamInfos = { "live:testchannel": info };
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		const emptyHoldUrl =
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1&media=live%3Atestchannel";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect(
				(g.fetch as typeof fetch)(emptyHoldUrl),
			).resolves.toBeInstanceOf(Response);
			expect(rawFetch).toHaveBeenCalledOnce();
			expect(rawFetch).toHaveBeenCalledWith(g._EMPTY_SEGMENT_URL);
		} finally {
			g.fetch = originalFetch;
		}
	});

	it.each([
		{
			label: "ad-marked",
			playlist: [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXT-X-CUE-OUT:30",
				"#EXTINF:2.000,",
				"ad-500.ts",
			].join("\n"),
		},
		{
			label: "clean",
			playlist: [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXTINF:2.000,live",
				"clean-500.ts",
			].join("\n"),
		},
	])(
		"does not expose an AVC $label response after enhanced-owner processing fails",
		async ({ playlist }) => {
			const originalFetch = g.fetch;
			const originalProcess = g._processM3U8;
			const mediaUrl =
				"https://video-weaver.example.ttvnw.net/v1/playlist/avc-active.m3u8";
			T<(scope: Record<string, unknown>) => void>("_declareState")(g);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			state.IsAdStrippingEnabled = true;
			const resolution = {
				Name: "1080p60",
				Resolution: "1920x1080",
				FrameRate: 60,
				Codecs: "avc1.64002A,mp4a.40.2",
			};
			const info = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_createStreamInfo")({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			info.IsShowingAd = true;
			info.VisibleAdStartedAt = 100;
			info.EnhancedDecoderCodecFamily = "hevc";
			info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
			info.ResolutionList = [resolution];
			info.Urls = Object.create(null);
			for (const alias of T<(url: string) => string[]>(
				"_getPlaylistUrlAliases",
			)(mediaUrl)) {
				(info.Urls as Record<string, unknown>)[alias] = resolution;
				(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
			}
			(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 100 },
			};
			const rawFetch = vi.fn(async () => {
				info.EnhancedDecoderCodecFamily = null;
				info.EnhancedDecoderCodec = null;
				return new Response(playlist, { status: 200 });
			});
			g.fetch = rawFetch;
			g._processM3U8 = async () => {
				throw new Error("forced processing failure");
			};

			try {
				T<() => void>("_hookWorkerFetch")();
				await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject(
					{
						name: "AbortError",
					},
				);
				expect(rawFetch).toHaveBeenCalledOnce();
			} finally {
				g.fetch = originalFetch;
				g._processM3U8 = originalProcess;
			}
		},
	);

	it("aborts an ad-marked unresolved rendition after processing fails", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/rotated-unresolved.m3u8";
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-500.ts",
		].join("\n");
		const rawFetch = vi.fn(
			async () => new Response(adPlaylist, { status: 200 }),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		g.fetch = rawFetch;
		g._processM3U8 = async () => {
			throw new Error("forced processing failure");
		};

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});

	it.each([
		{ label: "the 1440p ad context", ownerAtStart: true },
		{ label: "the 1440p owner and ad context", ownerAtStart: false },
	])(
		"aborts an AVC response when $label activates during fetch",
		async ({ ownerAtStart }) => {
			const originalFetch = g.fetch;
			const cleanPlaylist = [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXTINF:2.000,live",
				"clean-500.ts",
			].join("\n");
			T<(scope: Record<string, unknown>) => void>("_declareState")(g);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			state.IsAdStrippingEnabled = true;
			const mediaUrl =
				"https://video-weaver.example.ttvnw.net/v1/playlist/avc-activating.m3u8";
			const resolution = {
				Name: "1080p60",
				Resolution: "1920x1080",
				FrameRate: 60,
				Codecs: "avc1.64002A,mp4a.40.2",
			};
			const info = T<
				(context: Record<string, unknown>) => Record<string, unknown>
			>("_createStreamInfo")({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});
			info.EnhancedDecoderCodecFamily = ownerAtStart ? "hevc" : null;
			info.EnhancedDecoderCodec = ownerAtStart ? "hev1.1.6.L153.B0" : null;
			info.ResolutionList = [resolution];
			info.Urls = Object.create(null);
			for (const alias of T<(url: string) => string[]>(
				"_getPlaylistUrlAliases",
			)(mediaUrl)) {
				(info.Urls as Record<string, unknown>)[alias] = resolution;
				(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
			}
			(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
			state.CurrentAdChannel = null;
			state.CurrentAdMediaKey = null;
			const rawFetch = vi.fn(async () => {
				if (!ownerAtStart) {
					info.EnhancedDecoderCodecFamily = "hevc";
					info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
				}
				state.CurrentAdChannel = "testchannel";
				state.CurrentAdMediaKey = "live:testchannel";
				state.AdPodProgressByMediaKey = {
					"live:testchannel": { cycleStartedAt: 100 },
				};
				return new Response(cleanPlaylist, { status: 200 });
			});
			g.fetch = rawFetch;

			try {
				T<() => void>("_hookWorkerFetch")();
				await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject(
					{
						name: "AbortError",
					},
				);
				expect(rawFetch).toHaveBeenCalledOnce();
			} finally {
				g.fetch = originalFetch;
			}
		},
	);

	it("aborts a stale in-flight AVC response from the retiring 1440p ad cycle", async () => {
		const originalFetch = g.fetch;
		const opaqueAdUrl = "https://edge.example/opaque/stale-worker-ad-500.ts";
		const opaqueAdPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXTINF:2.000,",
			opaqueAdUrl,
		].join("\n");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-stale.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.EnhancedDecoderCodecFamily = "hevc";
		info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		state.AdSegmentCache = new Map([[opaqueAdUrl, Date.now()]]);
		const rawFetch = vi.fn(async () => {
			info.IsShowingAd = false;
			info.IsHoldingBackupAfterAd = false;
			info.EnhancedDecoderCodecFamily = null;
			info.EnhancedDecoderCodec = null;
			state.CurrentAdChannel = null;
			state.CurrentAdMediaKey = null;
			state.AdPodProgressByMediaKey = Object.create(null);
			return new Response(opaqueAdPlaylist, { status: 200 });
		});
		g.fetch = rawFetch;
		const controller = new AbortController();

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect(
				(g.fetch as typeof fetch)(
					new Request(mediaUrl, { signal: controller.signal }),
				),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("does not let stale pod progress abort the first clean post-ad playlist", async () => {
		const originalFetch = g.fetch;
		const cleanPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:600",
			"#EXTINF:2.000,live",
			"clean-600.ts",
		].join("\n");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/post-ad-avc.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = null;
		state.CurrentAdMediaKey = null;
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		const rawFetch = vi.fn(
			async () => new Response(cleanPlaylist, { status: 200 }),
		);
		g.fetch = rawFetch;

		try {
			T<() => void>("_hookWorkerFetch")();
			const result = await (await (g.fetch as typeof fetch)(mediaUrl)).text();
			expect(result).toContain("clean-600.ts");
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("strips an opaque cached ad only for its exact active media cycle", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const opaqueAdUrl = "https://edge.example/opaque/worker-ad-500.ts";
		const opaqueAdPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXTINF:2.000,",
			opaqueAdUrl,
		].join("\n");
		const rawFetch = vi.fn(
			async () => new Response(opaqueAdPlaylist, { status: 200 }),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = true;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-active.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.EncodingsM3U8 = "#EXTM3U";
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		state.AdSegmentCache = new Map([[opaqueAdUrl, Date.now()]]);
		g.fetch = rawFetch;
		let processCalls = 0;
		g._processM3U8 = async () => {
			processCalls++;
			if (processCalls === 1) {
				info.IsShowingAd = false;
				info.IsHoldingBackupAfterAd = false;
				state.CurrentAdChannel = null;
				state.CurrentAdMediaKey = null;
			}
			throw new Error("forced processing failure");
		};

		try {
			T<() => void>("_hookWorkerFetch")();
			const activeResult = await (
				await (g.fetch as typeof fetch)(mediaUrl)
			).text();
			expect(activeResult).not.toContain(opaqueAdUrl);
			expect(activeResult).toContain("__ttvab_empty_hold_segment.mp4");

			const staleResult = await (
				await (g.fetch as typeof fetch)(mediaUrl)
			).text();
			expect(staleResult).toBe(opaqueAdPlaylist);
			expect(rawFetch).toHaveBeenCalledTimes(2);
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});
});

describe("worker ad-segment codec ownership", () => {
	it("passes empty-hold and known ad segments through while disabled", async () => {
		const originalFetch = g.fetch;
		const emptyHoldUrl =
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1&media=live%3Atestchannel";
		const knownAdUrl = "https://edge.example/adsquared/unowned-ad.ts";
		const rawFetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			return new Response(`native:${url}`, { status: 200 });
		});
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.IsAdStrippingEnabled = false;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.SimulatedAdsDepth = 1;
		g.fetch = rawFetch;

		try {
			T<() => void>("_hookWorkerFetch")();
			expect(await (await (g.fetch as typeof fetch)(emptyHoldUrl)).text()).toBe(
				`native:${emptyHoldUrl}`,
			);
			expect(await (await (g.fetch as typeof fetch)(knownAdUrl)).text()).toBe(
				`native:${knownAdUrl}`,
			);
			expect(rawFetch).toHaveBeenNthCalledWith(1, emptyHoldUrl);
			expect(rawFetch).toHaveBeenNthCalledWith(2, knownAdUrl);
			expect(rawFetch).not.toHaveBeenCalledWith(g._EMPTY_SEGMENT_URL);
		} finally {
			g.fetch = originalFetch;
		}
	});

	const enhancedOrUnknownCases = [
		{
			label: "explicit HEVC",
			url: "https://edge.example/_404/hevc-ad.ts",
			cached: false,
			owner: {
				codecFamily: "hevc",
				mediaKey: "live:testchannel",
				recordedAt: 100,
				ambiguous: false,
			},
		},
		{
			label: "cached AV1",
			url: "https://edge.example/ad-cycle/av1-ad.m4s",
			cached: true,
			owner: {
				codecFamily: "av1",
				mediaKey: "live:testchannel",
				recordedAt: 100,
				ambiguous: false,
			},
		},
		{
			label: "explicit unknown-codec",
			url: "https://edge.example/adsquared/unowned-ad.ts",
			cached: false,
			owner: null,
		},
		{
			label: "cached ambiguous-codec",
			url: "https://edge.example/ad-cycle/ambiguous-ad.m4s",
			cached: true,
			owner: {
				codecFamily: null,
				mediaKey: null,
				recordedAt: 100,
				ambiguous: true,
			},
		},
	];

	it.each(enhancedOrUnknownCases)(
		"aborts a $label ad segment without fetching an AVC empty segment",
		async ({ url, cached, owner }) => {
			const originalFetch = g.fetch;
			const originalExactKey = g._getExactPlaylistUrlKey;
			const originalAbortError = g._createCodecHandoffAbortError;
			const rawFetch = vi.fn(async () => new Response("unexpected"));
			const exactKey = String(url);
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.SimulatedAdsDepth = 0;
			state.AdSignifier = "stitched";
			state.AdSegmentCache = new Map(cached ? [[exactKey, Date.now()]] : []);
			state.SegmentCodecOwners = new Map(owner ? [[exactKey, owner]] : []);
			g.fetch = rawFetch;
			g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
			g._createCodecHandoffAbortError = () =>
				new DOMException("Unsafe ad segment codec", "AbortError");

			try {
				T<() => void>("_hookWorkerFetch")();

				await expect((g.fetch as typeof fetch)(url)).rejects.toMatchObject({
					name: "AbortError",
				});
				expect(rawFetch).not.toHaveBeenCalled();
			} finally {
				g.fetch = originalFetch;
				if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
				else g._getExactPlaylistUrlKey = originalExactKey;
				if (originalAbortError === undefined) {
					delete g._createCodecHandoffAbortError;
				} else {
					g._createCodecHandoffAbortError = originalAbortError;
				}
			}
		},
	);

	it("uses the AVC empty segment after enhanced decoder ownership clears", async () => {
		const originalFetch = g.fetch;
		const originalExactKey = g._getExactPlaylistUrlKey;
		const originalAbortError = g._createCodecHandoffAbortError;
		const rawFetch = vi.fn(async () => new Response("empty avc segment"));
		const url = "https://edge.example/ad-cycle/avc-ad.ts";
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.SimulatedAdsDepth = 0;
		state.AdSignifier = "stitched";
		state.AdSegmentCache = new Map([[url, Date.now()]]);
		state.SegmentCodecOwners = new Map([
			[
				url,
				{
					codecFamily: "avc",
					mediaKey: "live:testchannel",
					recordedAt: 100,
					ambiguous: false,
				},
			],
		]);
		state.StreamInfos = {
			"live:testchannel": {
				EnhancedDecoderCodecFamily: null,
				EnhancedDecoderCodec: null,
			},
		};
		g.fetch = rawFetch;
		g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
		g._createCodecHandoffAbortError = () =>
			new DOMException("Unsafe ad segment codec", "AbortError");

		try {
			T<() => void>("_hookWorkerFetch")();

			await expect((g.fetch as typeof fetch)(url)).resolves.toBeInstanceOf(
				Response,
			);
			expect(rawFetch).toHaveBeenCalledOnce();
			expect(rawFetch).toHaveBeenCalledWith(g._EMPTY_SEGMENT_URL);
			expect(rawFetch).not.toHaveBeenCalledWith(url);
		} finally {
			g.fetch = originalFetch;
			if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
			else g._getExactPlaylistUrlKey = originalExactKey;
			if (originalAbortError === undefined) {
				delete g._createCodecHandoffAbortError;
			} else {
				g._createCodecHandoffAbortError = originalAbortError;
			}
		}
	});

	it.each([
		{ family: "hevc", codec: "hev1.1.6.L153.B0" },
		{ family: "av1", codec: "av01.0.13M.08" },
	])(
		"aborts an AVC-owned ad segment while the $family decoder still owns playback",
		async ({ family, codec }) => {
			const originalFetch = g.fetch;
			const originalExactKey = g._getExactPlaylistUrlKey;
			const originalAbortError = g._createCodecHandoffAbortError;
			const rawFetch = vi.fn(async () => new Response("unexpected"));
			const url = "https://edge.example/ad-cycle/avc-owned-enhanced.ts";
			const state = g.__TTVAB_STATE__ as Record<string, unknown>;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.SimulatedAdsDepth = 0;
			state.AdSignifier = "stitched";
			state.AdSegmentCache = new Map([[url, Date.now()]]);
			state.SegmentCodecOwners = new Map([
				[
					url,
					{
						codecFamily: "avc",
						mediaKey: "live:testchannel",
						recordedAt: 100,
						ambiguous: false,
					},
				],
			]);
			state.StreamInfos = {
				"live:testchannel": {
					EnhancedDecoderCodecFamily: family,
					EnhancedDecoderCodec: codec,
				},
			};
			g.fetch = rawFetch;
			g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
			g._createCodecHandoffAbortError = () =>
				new DOMException("Unsafe ad segment codec", "AbortError");

			try {
				T<() => void>("_hookWorkerFetch")();
				await expect((g.fetch as typeof fetch)(url)).rejects.toMatchObject({
					name: "AbortError",
				});
				expect(rawFetch).not.toHaveBeenCalled();
			} finally {
				g.fetch = originalFetch;
				if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
				else g._getExactPlaylistUrlKey = originalExactKey;
				if (originalAbortError === undefined) {
					delete g._createCodecHandoffAbortError;
				} else {
					g._createCodecHandoffAbortError = originalAbortError;
				}
			}
		},
	);
});

describe("worker watchdog visibility awareness", () => {
	function makeTrackedWorker(overrides: Record<string, unknown> = {}) {
		const worker: Record<string, unknown> = {
			pings: 0,
			postMessage() {
				(worker.pings as number)++;
			},
			__TTVABCreatedAt: Date.now(),
			__TTVABLastPongAt: Date.now(),
			__TTVABFirstPongAt: Date.now(),
			__TTVABMissedPongs: 0,
			__TTVABLastPingSentAt: 0,
			...overrides,
		};
		(g._S as { workers: unknown[] }).workers.push(worker);
		return worker;
	}

	function startWatchdog() {
		T<() => void>("_startWorkerWatchdog")();
	}

	function stopWatchdog() {
		const id = g._workerWatchdogID as ReturnType<typeof setInterval> | null;
		if (id !== null) clearInterval(id);
		g._workerWatchdogID = null;
	}

	afterEach(() => {
		stopWatchdog();
		delete g._isNativeDocumentHidden;
		delete g._isPlaybackPageUnfocused;
		delete g._getPrimaryMediaElement;
		delete g._installPageSideM3U8Override;
		delete g._hasUserPauseIntent;
	});

	it("never strikes a live ponging worker while the tab is hidden", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker = makeTrackedWorker();
		worker.postMessage = () => {
			(worker.pings as number)++;
			markPong(worker);
		};

		startWatchdog();
		vi.advanceTimersByTime(300000);

		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABCrashed).toBeUndefined();
		expect(worker.pings).toBeGreaterThan(0);
	});

	it("recovers a silent hidden worker when playback stops advancing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = vi.fn(() => false);
		const worker = makeTrackedWorker();

		startWatchdog();
		vi.advanceTimersByTime(19999);
		expect(worker.__TTVABCrashed).toBeUndefined();
		vi.advanceTimersByTime(1);
		expect(worker.__TTVABCrashed).toBe(true);
		expect(installFallback).toHaveBeenCalledOnce();
	});

	it("does not retire a throttled hidden worker during explicit user pause", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let hidden = true;
		let userPaused = true;
		g._isNativeDocumentHidden = () => hidden;
		g._hasUserPauseIntent = () => userPaused;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const installFallback = vi.fn();
		const playerTask = vi.fn(() => false);
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = playerTask;
		const worker = makeTrackedWorker({
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		});

		startWatchdog();
		vi.advanceTimersByTime(120000);
		expect(worker.__TTVABCrashed).toBeUndefined();
		expect((g._S as { workers: unknown[] }).workers).toContain(worker);
		expect(installFallback).not.toHaveBeenCalled();
		expect(playerTask).not.toHaveBeenCalled();

		userPaused = false;
		hidden = false;
		vi.advanceTimersByTime(10000);
		expect(worker.__TTVABCrashed).toBe(true);
		expect(installFallback).toHaveBeenCalledOnce();
	});

	it("does not retire a paused hidden PiP worker after route navigation", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		g._hasUserPauseIntent = (_channel: string, mediaKey: string) =>
			mediaKey === "live:pipchannel";
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => context.MediaKey === "live:pipchannel";
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "pagechannel",
			MediaKey: "live:pagechannel",
		});
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const installFallback = vi.fn();
		g._installPageSideM3U8Override = installFallback;
		g._doPlayerTask = vi.fn(() => false);
		const worker = makeTrackedWorker({
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "pipchannel",
			__TTVABPageMediaKey: "live:pipchannel",
		});

		try {
			startWatchdog();
			vi.advanceTimersByTime(120000);
			expect(worker.__TTVABCrashed).toBeUndefined();
			expect((g._S as { workers: unknown[] }).workers).toContain(worker);
			expect(installFallback).not.toHaveBeenCalled();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
			delete g._isActivePictureInPicturePlaybackContext;
		}
	});

	it("declares a silent worker crashed while hidden only after sustained stale evidence", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		const media = document.createElement("video");
		Object.defineProperty(media, "currentTime", {
			configurable: true,
			get: () => (Date.now() - 100000) / 1000,
		});
		g._getPrimaryMediaElement = () => media;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => {
			recordTestPlayerReload("live:testchannel");
			return true;
		};
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const worker = makeTrackedWorker();

		try {
			startWatchdog();
			vi.advanceTimersByTime(60000);
			expect(worker.__TTVABCrashed).toBeUndefined();

			vi.advanceTimersByTime(60000);
			expect(worker.__TTVABCrashed).toBe(true);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("declares quickly after refocus using evidence accrued while hidden", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let hidden = true;
		g._isNativeDocumentHidden = () => hidden;
		const media = document.createElement("video");
		Object.defineProperty(media, "currentTime", {
			configurable: true,
			get: () => (Date.now() - 100000) / 1000,
		});
		g._getPrimaryMediaElement = () => media;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => {
			recordTestPlayerReload("live:testchannel");
			return true;
		};
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const worker = makeTrackedWorker();

		try {
			startWatchdog();
			vi.advanceTimersByTime(40000);
			expect(worker.__TTVABCrashed).toBeUndefined();
			expect(Number(worker.__TTVABMissedPongs)).toBeGreaterThanOrEqual(2);

			hidden = false;
			vi.advanceTimersByTime(5000);
			expect(worker.__TTVABCrashed).toBe(true);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("restarts the ping window after a long gap instead of striking a resumed worker", () => {
		vi.useFakeTimers();
		vi.setSystemTime(700000);
		g._isNativeDocumentHidden = () => false;
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker = makeTrackedWorker({
			__TTVABLastPongAt: 700000 - 600000,
			__TTVABLastPingSentAt: 700000 - 600005,
		});

		startWatchdog();
		vi.advanceTimersByTime(5000);
		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABLastPingSentAt).toBe(705000);
		expect(worker.__TTVABCrashed).toBeUndefined();

		worker.postMessage = () => {
			(worker.pings as number)++;
			markPong(worker);
		};
		vi.advanceTimersByTime(30000);
		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABCrashed).toBeUndefined();
	});

	it("still declares a visible worker crashed after sustained unanswered pings", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => false;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => {
			recordTestPlayerReload("live:testchannel");
			return true;
		};
		const worker = makeTrackedWorker();

		startWatchdog();
		vi.advanceTimersByTime(25000);
		expect(worker.__TTVABCrashed).toBeUndefined();
		expect(worker.__TTVABMissedPongs).toBe(1);

		vi.advanceTimersByTime(5000);
		expect(worker.__TTVABCrashed).toBe(true);
	});

	it("defers recovery while hidden playback is still advancing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let hidden = true;
		g._isNativeDocumentHidden = () => hidden;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const reloads: unknown[][] = [];
		g._doPlayerTask = (...args: unknown[]) => {
			reloads.push(args);
			recordTestPlayerReload("live:testchannel");
			return true;
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{},
				{
					MediaType: "live",
					ChannelName: "testchannel",
				},
			);

			vi.advanceTimersByTime(1000);
			expect(reloads).toHaveLength(0);

			media.currentTime = 15;
			vi.advanceTimersByTime(5000);
			expect(reloads).toHaveLength(0);

			hidden = false;
			vi.advanceTimersByTime(5000);
			expect(reloads).toHaveLength(1);
			expect(reloads[0][2]).toEqual({
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			});
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("recovers while hidden once playback stops advancing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => {
			recordTestPlayerReload("live:testchannel");
			return true;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{},
				{ MediaType: "live", ChannelName: "testchannel" },
			);

			vi.advanceTimersByTime(5999);
			expect(playerTask).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("defers an unfocused visible reload while playback advances, then recovers when it stops", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => false;
		g._isPlaybackPageUnfocused = () => true;
		const media = document.createElement("video");
		media.currentTime = 10;
		g._getPrimaryMediaElement = () => media;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const playerTask = vi.fn(() => {
			recordTestPlayerReload("live:testchannel");
			return true;
		});
		g._doPlayerTask = playerTask;

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{},
				{ MediaType: "live", ChannelName: "testchannel" },
			);
			vi.advanceTimersByTime(1000);
			expect(playerTask).not.toHaveBeenCalled();

			media.currentTime = 15;
			vi.advanceTimersByTime(5000);
			expect(playerTask).not.toHaveBeenCalled();

			vi.advanceTimersByTime(5000);
			expect(playerTask).toHaveBeenCalledOnce();
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});
});

describe("bridge re-handshake on content-script announce", () => {
	function announceEvent() {
		const event = new MessageEvent("message", {
			data: { type: "ttvab-bridge-announce" },
		});
		Object.defineProperty(event, "source", { value: window });
		return event;
	}

	async function flushAsync(ms = 60) {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	it("re-broadcasts the session token for a stale port, but not for a fresh one", async () => {
		const bindHandshake = T<() => void>("_bindBridgePortHandshake");
		const attachBridgePort =
			T<(port: unknown, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const getToken = T<() => string>("_getBridgeSessionToken");
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(1000000);
		bindHandshake();
		const token = getToken();
		expect(attachBridgePort(makeBridgePort(), token)).toBe(true);
		await flushAsync();

		const requests: Array<{ detail?: { token?: string } }> = [];
		const recordRequests = (event: MessageEvent) => {
			const data = event.data as {
				type?: string;
				detail?: { token?: string };
			};
			if (data?.type === "ttvab-bridge-token-request") {
				requests.push(data);
			}
		};
		window.addEventListener("message", recordRequests);

		window.dispatchEvent(announceEvent());
		await flushAsync();
		expect(requests).toHaveLength(0);

		nowSpy.mockReturnValue(1005000);
		window.dispatchEvent(announceEvent());
		await flushAsync();
		expect(requests.length).toBeGreaterThanOrEqual(1);
		expect(requests[0]?.detail?.token).toBe(token);

		window.removeEventListener("message", recordRequests);
		nowSpy.mockRestore();
		await flushAsync(1100);
	});
});

describe("_isValid worker wrapper vetting", () => {
	beforeEach(() => {
		const s = g._S as Record<string, unknown>;
		s.conflicts = ["twitch", "isVariantA"];
		s.reinsertPatterns = ["isVariantA"];
		s.toleratedWorkerWrappers = [
			{
				name: "TwitchNoSub",
				signatures: ["${patch_url}", "twitchBlobUrl", "getWasmWorkerJs"],
			},
		];
	});

	it("accepts a plain unmarked constructor", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		expect(isValid(function PlainWorker() {})).toBe(true);
	});

	it("rejects revoked-proxy constructors without throwing", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		const { proxy, revoke } = Proxy.revocable(function ProxiedWorker() {}, {});
		revoke();
		expect(typeof proxy).toBe("function");
		expect(() => isValid(proxy)).not.toThrow();
		expect(isValid(proxy)).toBe(false);
	});

	it("rejects wrappers carrying conflict markers", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		const marked = () => {};
		marked.toString = () => "function () { window.twitch.hook(); }";
		expect(isValid(marked)).toBe(false);
	});
});

describe("worker bootstrap source-loading self-heal invariant", () => {
	it("either importScripts (throws on dead URL) or the empty-source guard is present", () => {
		const hooksJs = readFileSync(
			resolve(__dirname, "../dist/src/modules/hooks.js"),
			"utf8",
		);
		const usesImportScripts = hooksJs.includes("importScripts(");
		const usesEvalWithGuard =
			hooksJs.includes("_getWasmJs(") &&
			hooksJs.includes("original worker source fetch returned empty");
		expect(usesImportScripts || usesEvalWithGuard).toBe(true);
	});
});
