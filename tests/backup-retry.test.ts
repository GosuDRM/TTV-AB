import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const startedAt = 1000000;
const loggedSweepDurations = {
	site: 971,
	embed: 823,
	popout: 904,
	mobile_web: 892,
};
const nativeUrl = "https://cdn.example/native/index.m3u8";
const codecs = "avc1.64002a,mp4a.40.2";
const master = (type: string) =>
	[
		"#EXTM3U",
		`#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="${codecs}",VIDEO="1080p60"`,
		`https://cdn.example/${type}/index.m3u8`,
	].join("\n");
const media = (hasAds: boolean, sequence = 400) =>
	[
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
		`#EXTINF:2.000,${hasAds ? "stitched-ad" : "live"}`,
		`https://cdn.example/${hasAds ? "stitched-ad" : "content"}-${sequence}.ts`,
	].join("\n");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(startedAt);
});

afterEach(() => vi.useRealTimers());

function setup(
	firstDurations: Record<string, number> = {
		site: 2000,
		embed: 2500,
		popout: 2500,
		mobile_web: 1000,
	},
	retryStageDuration = 500,
) {
	const context = createContext({
		URL,
		URLSearchParams,
		Response,
		Request,
		Headers,
		EventTarget,
		Event,
		AbortController,
		DOMException,
		setTimeout,
		clearTimeout,
		performance,
		Date,
		navigator: { languages: ["en-US"], language: "en-US" },
	});
	runInContext(source, context);
	runInContext(
		`
		_log = () => {};
		_fetchViaWorkerBridge = undefined;
		_declareState(globalThis);
		globalThis.state = __TTVAB_STATE__;
		state.DisableAutoplayBackup = true;
		state.DisableAdSpoofing = true;
		state.BackupPlayerTypes = ["site", "embed", "popout", "mobile_web", "autoplay"];
		state.PageMediaKey = "live:testchannel";
		state.PageChannel = "testchannel";
		state.PageMediaType = "live";
		state.AuthorizationHeader = "OAuth test";
		state.ClientIntegrityHeader = "test-integrity";
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
		info.ResolutionList = [{ Name: "1080p60", Resolution: "1920x1080", FrameRate: 60, Codecs: ${JSON.stringify(codecs)} }];
		info.UsherBaseUrl = "https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8";
		state.StreamInfos[info.MediaKey] = info;
	`,
		context,
	);
	const { info, state } = context;
	info.EncodingsM3U8 = master("native");
	info.Urls[nativeUrl] = info.ResolutionList[0];
	state.StreamInfosByUrl[nativeUrl] = info;
	const controls = {
		clean: false,
		cleanType: "site",
		hang: "",
		status: 200,
		advance: true,
		payload: null as string | null,
		includeLowVariant: false,
	};
	const mediaRequests: { type: string; at: number }[] = [];
	const mediaCounts: Record<string, number> = {};
	const tokens: string[] = [];
	const aborted: string[] = [];
	const counts: Record<string, number> = {};
	const firstSweepDuration = Object.values(firstDurations).reduce(
		(total, duration) => total + duration,
		0,
	);
	let inFlight = 0;
	let maxInFlight = 0;
	let sequence = 500;
	const fetch = vi.fn(async (rawUrl: string, options: RequestInit = {}) => {
		const url = new URL(rawUrl);
		if (url.pathname.startsWith("/stitched-ad-")) {
			return new Response(new Uint8Array());
		}
		const stage =
			url.hostname === "gql.twitch.tv"
				? "token"
				: url.hostname === "usher.ttvnw.net"
					? "master"
					: "media";
		const type: string =
			stage === "token"
				? JSON.parse(String(options.body)).variables.playerType
				: stage === "master"
					? url.searchParams.get("token")
					: url.pathname.split("/")[1];
		if (stage === "token") {
			tokens.push(type);
			counts[type] = (counts[type] || 0) + 1;
			expect(new Headers(options.headers).get("Authorization")).toBe(
				"OAuth test",
			);
			expect(new Headers(options.headers).get("Client-Integrity")).toBe(
				"test-integrity",
			);
		}
		if (stage === "media") {
			mediaRequests.push({ type, at: Date.now() });
			mediaCounts[type] = (mediaCounts[type] || 0) + 1;
		}
		maxInFlight = Math.max(maxInFlight, ++inFlight);
		try {
			if (controls.hang === stage) {
				await new Promise<void>((_resolve, reject) => {
					options.signal?.addEventListener(
						"abort",
						() => {
							aborted.push(stage);
							reject(new DOMException("Aborted", "AbortError"));
						},
						{ once: true },
					);
				});
			}
			const duration =
				stage === "media"
					? mediaCounts[type] === 1
						? firstDurations[type]
						: retryStageDuration
					: counts[type] === 1
						? 0
						: retryStageDuration;
			if (duration)
				await new Promise((resolve) => setTimeout(resolve, duration));
			if (stage === "token")
				return new Response(
					JSON.stringify({
						data: {
							streamPlaybackAccessToken: { signature: "sig", value: type },
						},
					}),
				);
			if (stage === "master")
				return new Response(
					master(type) +
						(controls.includeLowVariant
							? `\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="${codecs}",VIDEO="360p"\nhttps://cdn.example/${type}/low/index.m3u8`
							: ""),
				);
			if (controls.hang === "body") {
				const response = new Response();
				response.arrayBuffer = () =>
					new Promise<ArrayBuffer>((_resolve, reject) => {
						options.signal?.addEventListener(
							"abort",
							() => {
								aborted.push("body");
								reject(new DOMException("Aborted", "AbortError"));
							},
							{ once: true },
						);
					});
				return response;
			}
			return new Response(
				controls.payload ??
					media(
						!(controls.clean && type === controls.cleanType),
						controls.advance ? sequence++ : sequence,
					),
				{ status: controls.status },
			);
		} finally {
			inFlight--;
		}
	});
	const process = (hasAds = true) =>
		context._processM3U8(nativeUrl, media(hasAds), fetch) as Promise<string>;
	const firstFailure = async () => {
		const result = process();
		await vi.advanceTimersByTimeAsync(firstSweepDuration);
		expect(await result).toContain("__ttvab_empty_hold_segment.mp4");
		expect(tokens).toEqual(["site", "embed", "popout", "mobile_web"]);
		expect(info._LastBackupSearchCompletedAt).toBe(
			startedAt + firstSweepDuration,
		);
	};
	const earlyRetry = () => context._getEarlyNoBackupRetry(info, 0, codecs);
	return {
		context,
		info,
		state,
		controls,
		tokens,
		mediaRequests,
		aborted,
		fetch,
		process,
		firstFailure,
		earlyRetry,
		concurrency: () => maxInFlight,
	};
}

describe("bounded recovery with low quality fallback disabled", () => {
	it("rechecks existing sessions sequentially without delaying the token sweep", async () => {
		const fixture = setup(loggedSweepDurations);
		await fixture.firstFailure();
		const completedAt = fixture.info._LastBackupSearchCompletedAt;
		const cooldowns = [...fixture.info.FailedBackupPlayerTypes];
		let previousHold = "";
		for (let attempt = 0; attempt < 6; attempt++) {
			vi.setSystemTime(completedAt + 1000 + attempt * 2000);
			const hold = await fixture.process();
			expect(hold).toContain("__ttvab_empty_hold_segment.mp4");
			expect(hold).not.toBe(previousHold);
			expect(hold).not.toContain("stitched-ad");
			previousHold = hold;
			await vi.advanceTimersByTimeAsync(500);
			expect(fixture.info.LastCleanBackupM3U8).toBeNull();
			expect(fixture.info._LastBackupSearchCompletedAt).toBe(completedAt);
			expect([...fixture.info.FailedBackupPlayerTypes]).toEqual(cooldowns);
		}
		expect(fixture.mediaRequests.slice(4).map(({ type }) => type)).toEqual([
			"site",
			"embed",
			"popout",
			"mobile_web",
			"site",
			"embed",
		]);
		expect(fixture.tokens).toHaveLength(4);
		expect(fixture.info._NoBackupRecoveryCandidates.size).toBe(4);
		vi.setSystemTime(completedAt + 15000);
		const regular = fixture.process();
		await vi.advanceTimersByTimeAsync(6000);
		expect(await regular).toContain("__ttvab_empty_hold_segment.mp4");
		expect(fixture.tokens).toEqual([
			"site",
			"embed",
			"popout",
			"mobile_web",
			"site",
			"embed",
			"popout",
			"mobile_web",
		]);
		expect(fixture.concurrency()).toBe(1);
	});

	it("continues checking after two failed sweeps and promotes two clean advancing samples before the next 15-second wait ends", async () => {
		const fixture = setup(loggedSweepDurations);
		await fixture.firstFailure();
		const firstCompletedAt = fixture.info._LastBackupSearchCompletedAt;
		vi.setSystemTime(firstCompletedAt + 1000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		const originalCandidate =
			fixture.info._NoBackupRecoveryCandidates.get("site");
		vi.setSystemTime(firstCompletedAt + 15000);
		const regular = fixture.process();
		await vi.advanceTimersByTimeAsync(6000);
		expect(await regular).toContain("__ttvab_empty_hold_segment.mp4");
		const completedAt = fixture.info._LastBackupSearchCompletedAt;
		expect(fixture.info._NoBackupRecoveryCandidates.get("site")).not.toBe(
			originalCandidate,
		);
		fixture.controls.clean = true;
		fixture.controls.cleanType = "embed";
		for (let attempt = 0; attempt < 3; attempt++) {
			vi.setSystemTime(completedAt + 2000 + attempt * 2000);
			expect(await fixture.process()).toContain(
				"__ttvab_empty_hold_segment.mp4",
			);
			await vi.advanceTimersByTimeAsync(500);
			if (attempt < 2) expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		}
		expect(fixture.info.LastCleanBackupM3U8).toContain("/content-");
		expect(fixture.info._LastBackupSearchCompletedAt).toBe(0);
		expect(fixture.info._NoBackupRecoveryCandidates.size).toBe(0);
		expect(Date.now() - completedAt).toBe(6500);
		const selected = fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(await selected).toContain("/content-");
		expect(fixture.info.ActiveBackupPlayerType).toBe("embed");
		expect(fixture.info.ActiveBackupResolution).toBe("1920x1080");
		expect(fixture.info.HevcReloadPendingAfterHold).toBe(false);
		const clean = fixture.info.LastCleanBackupM3U8;
		await vi.advanceTimersByTimeAsync(1000);
		const refreshed = fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(await refreshed).not.toBe(clean);
		expect(fixture.info.LastCleanBackupM3U8).not.toBe(clean);
		expect(fixture.tokens).toHaveLength(8);
		expect(fixture.concurrency()).toBe(1);
	});

	it("rejects repeated and expired clean samples without media-sequence advancement", async () => {
		const fixture = setup();
		await fixture.firstFailure();
		fixture.controls.clean = true;
		fixture.controls.advance = false;
		for (let attempt = 0; attempt < 3; attempt++) {
			vi.setSystemTime(startedAt + 9000 + attempt * 2000);
			expect(await fixture.process()).toContain(
				"__ttvab_empty_hold_segment.mp4",
			);
			await vi.advanceTimersByTimeAsync(500);
			expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		}
		fixture.controls.advance = true;
		vi.setSystemTime(startedAt + 15000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		expect(fixture.tokens).toHaveLength(4);
		expect(fixture.mediaRequests.at(-1).type).toBe("embed");
	});

	it("promotes a rechecked backup while native playback still needs ad-end confirmation", async () => {
		const fixture = setup();
		await fixture.firstFailure();
		fixture.controls.clean = true;
		vi.setSystemTime(startedAt + 9000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		vi.setSystemTime(startedAt + 11000);
		expect(await fixture.process(false)).toContain(
			"__ttvab_empty_hold_segment.mp4",
		);
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.info.LastCleanBackupM3U8).toContain("/content-");
		expect(fixture.info.IsShowingAd).toBe(true);
		expect(await fixture.process(false)).toContain("/content-");
		expect(fixture.info.IsUsingBackupStream).toBe(true);
		expect(fixture.tokens).toHaveLength(4);
	});

	it.each(["ad", "empty", "unplayable", "backward", "missing-sequence"])(
		"does not promote a previously clean probe after a %s response",
		async (kind) => {
			const fixture = setup();
			await fixture.firstFailure();
			fixture.controls.clean = true;
			vi.setSystemTime(startedAt + 9000);
			await fixture.process();
			await vi.advanceTimersByTimeAsync(500);
			expect(
				fixture.info._NoBackupRecoveryCandidates.get("site").cleanStartedAt,
			).toBeGreaterThan(0);
			if (kind === "ad") fixture.controls.clean = false;
			if (kind === "empty") fixture.controls.payload = "";
			if (kind === "unplayable")
				fixture.controls.payload = "#EXTM3U\n#EXT-X-TARGETDURATION:2";
			if (kind === "backward") fixture.controls.payload = media(false, 1);
			if (kind === "missing-sequence")
				fixture.controls.payload = media(false).replace(
					/#EXT-X-MEDIA-SEQUENCE:.*\n/,
					"",
				);
			vi.setSystemTime(startedAt + 11000);
			expect(await fixture.process()).not.toContain("stitched-ad");
			await vi.advanceTimersByTimeAsync(500);
			expect(fixture.info.LastCleanBackupM3U8).toBeNull();
			expect(fixture.tokens).toHaveLength(4);
			if (kind !== "backward")
				expect(
					fixture.info._NoBackupRecoveryCandidates.get("site").cleanStartedAt,
				).toBe(0);
		},
	);

	it.each(["missing-master", "changed-media-url"])(
		"does not acquire a token or promote old clean proof for a %s candidate",
		async (change) => {
			const fixture = setup();
			await fixture.firstFailure();
			fixture.controls.clean = true;
			vi.setSystemTime(startedAt + 9000);
			await fixture.process();
			await vi.advanceTimersByTimeAsync(500);
			const candidate = fixture.info._NoBackupRecoveryCandidates.get("site");
			if (change === "missing-master") candidate.cache = null;
			if (change === "changed-media-url")
				candidate.cache = {
					...candidate.cache,
					m3u8: master("different-session"),
				};
			vi.setSystemTime(startedAt + 11000);
			expect(await fixture.process()).toContain(
				"__ttvab_empty_hold_segment.mp4",
			);
			await vi.advanceTimersByTimeAsync(500);
			expect(fixture.info.LastCleanBackupM3U8).toBeNull();
			expect(fixture.tokens).toHaveLength(4);
			expect(fixture.mediaRequests).toHaveLength(
				change === "missing-master" ? 5 : 6,
			);
		},
	);

	it("rechecks the current quality from the retained session after the player ramps from 360p to 1080p", async () => {
		const fixture = setup();
		fixture.controls.includeLowVariant = true;
		const high = fixture.info.ResolutionList[0];
		const low = {
			Name: "360p",
			Resolution: "640x360",
			FrameRate: 30,
			Codecs: codecs,
		};
		fixture.info.ResolutionList.push(low);
		fixture.info.Urls[nativeUrl] = low;
		fixture.state.PreferredQualityGroup = "360p";
		await fixture.firstFailure();
		const candidate = fixture.info._NoBackupRecoveryCandidates.get("site");
		expect(candidate.playlistUrl).toContain("/low/");
		fixture.controls.clean = true;
		vi.setSystemTime(startedAt + 9000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		fixture.info.Urls[nativeUrl] = high;
		fixture.state.PreferredQualityGroup = "1080p60";
		vi.setSystemTime(startedAt + 11000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(candidate.playlistUrl).toBe("https://cdn.example/site/index.m3u8");
		expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		vi.setSystemTime(startedAt + 13000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.info.LastCleanBackupM3U8).toContain("/content-");
		expect(fixture.info.LastCleanBackupResolution).toBe("1920x1080");
		expect(fixture.tokens).toHaveLength(4);
		expect(fixture.concurrency()).toBe(1);
	});

	it("drops an expired media URL without obtaining another token during the wait", async () => {
		const fixture = setup();
		await fixture.firstFailure();
		fixture.controls.status = 403;
		vi.setSystemTime(startedAt + 9000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.info._NoBackupRecoveryCandidates.has("site")).toBe(false);
		fixture.controls.status = 200;
		vi.setSystemTime(startedAt + 11000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(fixture.mediaRequests.at(-1).type).toBe("embed");
		expect(fixture.tokens).toHaveLength(4);
	});

	it.each(["media", "body"])(
		"aborts a slow %s check before the regular sweep without aborting the ad cycle",
		async (stage) => {
			const fixture = setup();
			await fixture.firstFailure();
			const completedAt = fixture.info._LastBackupSearchCompletedAt;
			const regularRetryAt = completedAt + 15000;
			vi.setSystemTime(regularRetryAt - 1500);
			fixture.controls.hang = stage;
			expect(await fixture.process()).toContain(
				"__ttvab_empty_hold_segment.mp4",
			);
			await vi.advanceTimersByTimeAsync(1250);
			expect(fixture.aborted).toEqual([stage]);
			expect(fixture.info._AdCycleRequestController.signal.aborted).toBe(false);
			expect(fixture.info._BackupSearchPromises.size).toBe(0);
			expect(fixture.info._LastBackupSearchCompletedAt).toBe(completedAt);
			fixture.controls.hang = "";
			fixture.controls.clean = true;
			vi.setSystemTime(regularRetryAt);
			const recovered = fixture.process();
			await vi.advanceTimersByTimeAsync(1500);
			expect(await recovered).toContain("/content-");
			expect(fixture.tokens).toHaveLength(5);
			expect(fixture.concurrency()).toBe(1);
		},
	);

	it.each(["route", "cycle", "reset", "codec", "toggle", "replacement"])(
		"rejects a delayed second clean sample after a %s change",
		async (change) => {
			const fixture = setup();
			await fixture.firstFailure();
			fixture.controls.clean = true;
			vi.setSystemTime(startedAt + 9000);
			await fixture.process();
			await vi.advanceTimersByTimeAsync(500);
			vi.setSystemTime(startedAt + 11000);
			await fixture.process();
			await vi.advanceTimersByTimeAsync(100);
			if (change === "route") fixture.state.PageMediaKey = "live:other";
			if (change === "codec") fixture.info.EnhancedDecoderCodecFamily = "hevc";
			if (change === "toggle") fixture.state.DisableAutoplayBackup = false;
			if (change === "cycle") {
				fixture.info.VisibleAdStartedAt = Date.now();
				fixture.info.BackupSearchEpoch++;
			}
			if (change === "reset") fixture.context._resetStreamAdState(fixture.info);
			if (change === "replacement")
				fixture.info._NoBackupRecoveryCandidates.set("site", {
					...fixture.info._NoBackupRecoveryCandidates.get("site"),
				});
			await vi.advanceTimersByTimeAsync(2000);
			expect(fixture.info.LastCleanBackupM3U8).toBeNull();
			expect(fixture.info._BackupSearchPromises.size).toBe(0);
			expect(fixture.tokens).toHaveLength(4);
		},
	);

	it("discards a late clean body even when the deadline timer has not run", async () => {
		const fixture = setup();
		await fixture.firstFailure();
		fixture.controls.clean = true;
		vi.setSystemTime(startedAt + 9000);
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		vi.setSystemTime(startedAt + 11000);
		const retry = fixture.earlyRetry();
		const fetch = fixture.fetch.getMockImplementation();
		let deadlinePassedBeforeAbort = false;
		fixture.fetch.mockImplementation(async (...args) => {
			const response = await fetch(...args);
			if (args[0] === "https://cdn.example/site/index.m3u8") {
				const readBody = response.arrayBuffer.bind(response);
				response.arrayBuffer = async () => {
					const body = await readBody();
					vi.setSystemTime(retry.deadlineAt + 1);
					deadlinePassedBeforeAbort = args[1]?.signal?.aborted === false;
					return body;
				};
			}
			return response;
		});
		await fixture.process();
		await vi.advanceTimersByTimeAsync(500);
		expect(deadlinePassedBeforeAbort).toBe(true);
		expect(fixture.info.LastCleanBackupM3U8).toBeNull();
		expect(fixture.info._BackupSearchPromises.size).toBe(0);
	});

	it.each([
		"enabled",
		"held",
		"hevc",
		"av1",
		"unknown",
		"vod",
		"pending",
		"late",
		"cadence",
		"forced",
		"previous-cycle",
		"expired",
	])("retains existing behavior for %s playback", async (mode) => {
		const fixture = setup();
		await fixture.firstFailure();
		vi.setSystemTime(startedAt + 10000);
		let requestCodecs = codecs;
		if (mode === "enabled") fixture.state.DisableAutoplayBackup = false;
		if (mode === "held") fixture.info.LastCleanBackupAt = Date.now();
		if (mode === "hevc") fixture.info.EnhancedDecoderCodecFamily = "hevc";
		if (mode === "av1") requestCodecs = "av01.0.08M.08,mp4a.40.2";
		if (mode === "unknown") requestCodecs = "";
		if (mode === "vod") fixture.info.MediaType = "vod";
		if (mode === "pending")
			fixture.info._BackupSearchPromise = Promise.resolve(null);
		if (mode === "late") vi.setSystemTime(startedAt + 22000);
		if (mode === "cadence")
			fixture.info._LastNoBackupProbeAt = Date.now() - 1000;
		if (mode === "forced")
			fixture.state.BackupSearchForceRefreshAt = Date.now();
		if (mode === "previous-cycle")
			fixture.info.VisibleAdStartedAt = startedAt + 9000;
		if (mode === "expired")
			for (const entry of fixture.info._NoBackupRecoveryCandidates.values())
				entry.createdAt = Date.now() - 60001;
		expect(
			fixture.context._getEarlyNoBackupRetry(fixture.info, 0, requestCodecs),
		).toBeNull();
		expect(fixture.tokens).toHaveLength(4);
	});
});
