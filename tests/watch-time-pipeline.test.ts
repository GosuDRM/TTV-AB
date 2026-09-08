import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
	readFileSync(resolve(__dirname, `../dist/src/${file}.js`), "utf8");
const pageSource = ["constants", "state", "parser", "player"]
	.map((name) => read(`modules/${name}`))
	.join("\n");

function setup(turboMode = true) {
	let now = 1_800_000_000_000;
	let timerId = 0;
	let connected = true;
	class ClockDate extends Date {
		static now() {
			return now;
		}
	}
	class Media {}
	class Video extends Media {
		paused = false;
		ended = false;
		readyState = 4;
	}
	const journal = new Map<string, string>();
	const localStorage = {
		get length() {
			return journal.size;
		},
		key: (index: number) => [...journal.keys()][index] ?? null,
		getItem: (key: string) => journal.get(key) ?? null,
		setItem: (key: string, value: string) => journal.set(key, String(value)),
		removeItem: (key: string) => journal.delete(key),
	};
	const shared = {
		URL,
		URLSearchParams,
		EventTarget,
		Event,
		AbortController,
		DOMException,
		performance,
		TextEncoder,
		localStorage,
		Date: ClockDate,
		setTimeout: () => ++timerId,
		clearTimeout: () => {},
		HTMLMediaElement: Media,
		HTMLVideoElement: Video,
	};
	const window = {
		location: new URL("https://www.twitch.tv/testchannel"),
		addEventListener() {},
		postMessage() {},
	};
	const stored = {
		ttvTurboMode: turboMode,
		ttvAdsBlocked: 46,
		ttvStats: { channels: { testchannel: { ads: 46, watchSeconds: 600 } } },
	};
	type Change = Record<string, { oldValue?: unknown; newValue: unknown }>;
	const listeners: Array<(changes: Change, area: string) => void> = [];
	const storage = {
		local: {
			get: (_keys: unknown, callback: (value: unknown) => void) =>
				callback(stored),
			set: (value: Record<string, unknown>, callback: () => void) => {
				Object.assign(stored, value);
				callback();
			},
		},
		onChanged: {
			addListener: (listener: (changes: Change, area: string) => void) =>
				listeners.push(listener),
		},
	};
	let backgroundListener: (
		message: unknown,
		sender: unknown,
		callback: (value: unknown) => void,
	) => void;
	const background = createContext({
		...shared,
		chrome: {
			storage,
			runtime: {
				id: "test-extension",
				lastError: null,
				onMessage: {
					addListener: (listener: typeof backgroundListener) => {
						backgroundListener = listener;
					},
				},
			},
		},
	});
	runInContext(read("scripts/background"), background);
	const pending: Promise<unknown>[] = [];
	const bridge = createContext({
		...shared,
		window,
		chrome: {
			storage,
			runtime: {
				id: "test-extension",
				lastError: null,
				onMessage: { addListener() {} },
				sendMessage: (message: unknown, callback: (value: unknown) => void) => {
					pending.push(
						new Promise((resolveResponse) => {
							backgroundListener(
								message,
								{ id: "test-extension", tab: { id: 1 } },
								(response) => {
									callback(response);
									resolveResponse(response);
								},
							);
						}),
					);
				},
			},
		},
	});
	runInContext(read("scripts/bridge"), bridge);
	const page = createContext({
		...shared,
		window,
		location: window.location,
		document: { pictureInPictureElement: null },
		relay: (message: unknown) => {
			if (!connected) return;
			bridge.incoming = message;
			runInContext("handlePageBridgeMessage(incoming)", bridge);
		},
	});
	runInContext(pageSource, page);
	runInContext(
		`
		_declareState(globalThis);
		__TTVAB_STATE__.PageChannel = "testchannel";
		__TTVAB_STATE__.PageMediaKey = "live:testchannel";
		__TTVAB_STATE__.PageMediaType = "live";
		_WatchTimeState.ownedMediaKey = "live:testchannel";
		_getActivePictureInPicturePlaybackContext = () => null;
		globalThis.video = new HTMLVideoElement();
		_getPrimaryMediaElement = () => video;
		_bridgePort = { postMessage: relay };
		_trackChannelWatchTime(false);
	`,
		page,
	);
	return {
		page,
		bridge,
		background,
		stored,
		journal,
		advance: (milliseconds: number) => {
			now += milliseconds;
		},
		track: () => runInContext("_trackChannelWatchTime(false)", page),
		watch: (seconds: number) => {
			for (let i = 0; i < seconds; i++) {
				now += 1000;
				runInContext("_trackChannelWatchTime(false)", page);
			}
		},
		toggle: (newValue: boolean) => {
			const oldValue = stored.ttvTurboMode;
			stored.ttvTurboMode = newValue;
			for (const listener of listeners)
				listener({ ttvTurboMode: { oldValue, newValue } }, "local");
		},
		disconnect: () => {
			connected = false;
		},
		flush: async () => {
			runInContext("flushCounters()", bridge);
			while (pending.length > 0) await Promise.all(pending.splice(0));
			await runInContext("persistChain", background);
		},
	};
}

describe("watch-time delivery across Turbo boundaries", () => {
	it("credits only the second watched after Turbo was disabled, preserving stored history", async () => {
		const app = setup();
		app.watch(14);
		app.toggle(false);
		app.watch(1);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(601);
		expect(app.stored.ttvAdsBlocked).toBe(46);
	});

	it("does not infer watch time from a paused gap spanning the Turbo boundary", async () => {
		const app = setup();
		app.watch(14);
		app.page.video.paused = true;
		app.track();
		app.toggle(false);
		app.advance(30000);
		app.page.video.paused = false;
		app.track();
		app.watch(1);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(601);
	});

	it("preserves complete watch batches when statistics stay enabled", async () => {
		const app = setup(false);
		app.watch(30);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(630);
	});

	it("keeps fractional watch intervals aligned across a regular flush and page exit", async () => {
		const app = setup(false);
		for (let i = 0; i < 26; i++) {
			app.advance(600);
			app.track();
		}
		app.advance(500);
		runInContext("_flushWatchTimeOnPageExit()", app.page);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(616);
	});

	it("discards watch intervals journaled on exit during Turbo even after background state is lost", async () => {
		const app = setup();
		app.watch(14);
		app.disconnect();
		runInContext("_flushWatchTimeOnPageExit()", app.page);
		expect(app.journal.size).toBe(1);
		app.advance(1000);
		app.toggle(false);
		await app.flush();
		runInContext("watchStatsSinceAt = 0", app.background);
		runInContext("replayPersistedCounterFlushes()", app.bridge);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(600);
		expect(app.journal.size).toBe(0);
	});

	it("preserves a post-Turbo exit journal's measured second through replay", async () => {
		const app = setup();
		app.watch(7);
		app.toggle(false);
		app.watch(1);
		app.disconnect();
		runInContext("_flushWatchTimeOnPageExit()", app.page);
		runInContext("replayPersistedCounterFlushes()", app.bridge);
		await app.flush();
		expect(app.stored.ttvStats.channels.testchannel.watchSeconds).toBe(601);
		expect(app.journal.size).toBe(0);
	});
});
