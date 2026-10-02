import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "player"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");

function setup() {
	vi.useFakeTimers();
	const values = new Map<string, string>();
	const context = createContext({
		URL,
		EventTarget,
		Event,
		WeakRef,
		HTMLMediaElement,
		HTMLVideoElement,
		document,
		window: new EventTarget(),
		location: { href: "https://www.twitch.tv/testchannel" },
		setTimeout,
		clearTimeout,
		clearInterval,
		Date,
		localStorage: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, String(value)),
			removeItem: (key: string) => values.delete(key),
		},
	});
	runInContext(source, context);
	runInContext("_declareState(globalThis); _log = () => {};", context);
	const state = context.__TTVAB_STATE__;
	Object.assign(state, {
		PageMediaKey: "live:testchannel",
		PageChannel: "testchannel",
		PageMediaType: "live",
	});
	const owner = { video: document.createElement("video") };
	document.body.append(owner.video);
	owner.video.volume = 0.8;
	context._getPlayerAndState = () => ({
		player: { getHTMLVideoElement: () => owner.video },
	});
	context._getPrimaryMediaElement = () => owner.video;
	context._getActivePictureInPicturePlaybackContext = () => null;
	const capture = () =>
		context._capturePlayerPreferenceSnapshot(null, owner.video, {
			channel: "testchannel",
			mediaKey: "live:testchannel",
			preserveConfiguredQuality: true,
		});
	const schedule = (snapshot: unknown) => {
		context._schedulePlayerMediaPreferenceRestores(
			snapshot,
			"testchannel",
			"live:testchannel",
		);
		context._schedulePlayerPreferenceRestore(
			snapshot,
			"testchannel",
			"live:testchannel",
		);
	};
	return { context, owner, state, values, capture, schedule };
}

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe("reload preference ownership", () => {
	it.each([0, 120, 500, 1500])(
		"preserves same-tab audio and quality choices made at %d ms",
		(delay) => {
			const { owner, values, capture, schedule } = setup();
			values.set("video-quality", '{"default":"1080p60"}');
			values.set("lowLatencyModeEnabled", "true");
			schedule(capture());
			vi.advanceTimersByTime(delay);
			owner.video.muted = true;
			owner.video.volume = 0.2;
			values.set("video-quality", '{"default":"720p60"}');
			values.set("lowLatencyModeEnabled", "false");
			vi.advanceTimersByTime(3001 - delay);
			expect(owner.video.muted).toBe(true);
			expect(owner.video.volume).toBe(0.2);
			expect(values.get("video-quality")).toBe('{"default":"720p60"}');
			expect(values.get("lowLatencyModeEnabled")).toBe("false");
		},
	);

	it("restores a replacement once while retaining later user changes across remounts", () => {
		const { owner, capture, schedule } = setup();
		owner.video.muted = true;
		schedule(capture());
		owner.video.remove();
		owner.video = document.createElement("video");
		document.body.append(owner.video);
		vi.advanceTimersByTime(120);
		expect(owner.video.muted).toBe(true);
		expect(owner.video.volume).toBe(0.8);
		owner.video.muted = false;
		owner.video.volume = 0.3;
		vi.advanceTimersByTime(380);
		owner.video.remove();
		owner.video = document.createElement("video");
		document.body.append(owner.video);
		vi.advanceTimersByTime(2500);
		expect(owner.video.muted).toBe(false);
		expect(owner.video.volume).toBe(0.3);
	});

	it.each([false, true])(
		"keeps PiP audio restores on their exact element after navigation (exit=%s)",
		(exit) => {
			const { context, owner, state, capture, schedule } = setup();
			schedule(capture());
			const pipVideo = document.createElement("video");
			pipVideo.muted = true;
			pipVideo.volume = 0.1;
			document.body.append(pipVideo);
			owner.video = document.createElement("video");
			owner.video.muted = true;
			owner.video.volume = 0.2;
			document.body.append(owner.video);
			state.PageMediaKey = "live:other";
			state.PageChannel = "other";
			context.location.href = "https://www.twitch.tv/other";
			context._getActivePictureInPicturePlaybackContext = () =>
				exit
					? null
					: {
							MediaKey: "live:testchannel",
							ChannelName: "testchannel",
							element: pipVideo,
						};
			context._clearPlaybackRecoveryTimeouts("live:testchannel");
			context._resetPlaybackIntentForNavigation(
				"other",
				"live:other",
				2500,
				"live:testchannel",
			);
			vi.advanceTimersByTime(3001);
			expect(owner.video.muted).toBe(true);
			expect(owner.video.volume).toBe(0.2);
			expect(pipVideo.muted).toBe(exit);
			expect(pipVideo.volume).toBe(exit ? 0.1 : 0.8);
		},
	);

	it("does not write detached media or a superseded reload's preferences", () => {
		const { context, owner, values, capture, schedule } = setup();
		values.set("video-quality", '{"default":"1080p60"}');
		const snapshot = capture();
		snapshot.__isCurrent = () => false;
		snapshot.__mediaState.isCurrent = () => false;
		schedule(snapshot);
		owner.video.muted = true;
		owner.video.remove();
		vi.advanceTimersByTime(3001);
		expect(owner.video.muted).toBe(true);
		expect(
			context._restorePlayerMediaPreferenceSnapshot(
				{ muted: false, volume: 1 },
				{ channel: "testchannel", mediaKey: "live:testchannel" },
			),
		).toBe(false);
	});
});
