import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const scope = createContext({ EventTarget });
runInContext(
	["state", "worker-entry"]
		.map((name) =>
			readFileSync(resolve(root, `dist/src/modules/${name}.js`), "utf8"),
		)
		.join("\n"),
	scope,
);
const decode = (message: unknown) =>
	scope._getWorkerCommand({ __ttvabWorkerBridge: true, message });
const decodeEvent = (message: unknown) =>
	scope._getWorkerEvent({ __ttvabWorkerBridge: true, message });

const eventPayloads = {
	Pong: { value: null },
	CancelFetchRequest: { value: { id: "fetch-1" } },
	FetchRequest: {
		value: {
			id: "fetch-1",
			url: "https://gql.twitch.tv/gql",
			options: {
				method: "POST",
				headers: { "Client-ID": "client" },
				body: "{}",
			},
		},
	},
	WorkerErrorDiagnostic: {
		value: {
			message: "worker failed",
			filename: "worker.js",
			lineno: 1,
			colno: 2,
			stack: "stack",
		},
	},
	PlaybackWorkerObserved: {
		playlistUrl: "https://example.invalid/native.m3u8",
		codec: "avc1",
		decoderCodec: "avc1",
	},
	PlaybackWorkerBootstrapObserved: {},
	MediaBootstrapRecoveryNeeded: {},
	VodAdRequestBlocked: { sessionID: "vod-session" },
	PreviewMasterRecoveryFailed: {
		reason: "request-failed",
		reportedAt: 1200,
		status: 403,
	},
	LogEntry: { value: { t: 1200, l: "info", m: "worker started" } },
	AdBlocked: { count: 3, delta: 1 },
	AdSecondsBlocked: {
		measurements: [
			{
				id: "stitched-ad-1",
				durationMilliseconds: 30000,
				startDateMilliseconds: 1000,
			},
		],
	},
	AdPodProgress: {
		adIds: ["stitched-ad-1"],
		expectedPodLength: 2,
		maxAdPodPosition: 1,
		observedZeroAdPodPosition: true,
		updatedAt: 1200,
	},
	AdDetected: {
		continued: false,
		detectedAt: 1000,
		playlistUrl: "https://example.invalid/native.m3u8",
		codec: "avc1",
	},
	AdEnded: { endedAt: 2000, holdingBackup: true, willReload: false },
	BackupPlayerTypeSelected: { value: "site" },
	FatalMediaRecoveryReady: {
		recoveryId: "recovery-1000",
		verifiedAt: 1200,
		requiresCodecHandoff: true,
		backupPlayerType: "site",
	},
	PostAdNativeReloadReady: {
		reloadAt: 2000,
		confirmedAt: 2100,
		loaderEpoch: 2,
	},
	PostAdNativeSession: {
		pageGeneration: 2,
		phase: "armed",
		codec: "avc1",
		resolution: "2560x1440",
		reloadAt: 2000,
		expiresAt: 32000,
	},
	NativePlaybackRestored: {
		restoredAt: 2100,
		fromSilentBackupHold: true,
		requiresReload: false,
		continuePlayback: true,
		refreshAccessToken: false,
	},
	PauseResumePlayer: {},
	ReloadPlayer: {
		reason: "post-ad",
		refreshAccessToken: false,
		newMediaPlayerInstance: false,
	},
};

describe("worker event boundary", () => {
	it.each(Object.entries(eventPayloads))(
		"accepts the %s event without rewriting ownership or values",
		(key, payload) => {
			const message = {
				key,
				...payload,
				mediaType: "live",
				channel: "buildtest",
				mediaKey: "live:buildtest",
				pageChannel: "buildtest",
				pageMediaKey: "live:buildtest",
				pageContextGeneration: 2,
				cycleStartedAt: 1000,
				handoffId: null,
			};
			expect(decodeEvent(message)).toBe(message);
		},
	);

	it.each([
		{ key: "Pong" },
		{ key: "AdBlocked" },
		{ key: "AdSecondsBlocked", seconds: 22 },
		{ key: "AdDetected", channel: "buildtest" },
		{ key: "AdEnded", mediaKey: "live:buildtest" },
		{ key: "ReloadPlayer", mediaKey: "live:buildtest" },
		{ key: "BackupPlayerTypeSelected", value: null },
		{
			key: "PlaybackWorkerObserved",
			mediaType: "vod",
			vodID: 123,
			mediaKey: "vod:123",
		},
		{
			key: "FetchRequest",
			value: { id: "fetch-1", url: "https://gql.twitch.tv/gql" },
		},
		{
			key: "FetchRequest",
			value: {
				id: "fetch-1",
				url: "https://gql.twitch.tv/gql",
				options: {
					headers: [["Client-ID", "client"]],
					credentials: "include",
					mode: "cors",
					cache: "no-store",
					redirect: "follow",
					referrerPolicy: "no-referrer",
					keepalive: true,
					body: null,
				},
			},
		},
		{ key: "LogEntry", value: { t: {}, l: 1, m: {} } },
		{ key: "WorkerErrorDiagnostic", value: { message: {}, lineno: "invalid" } },
		{
			key: "AdSecondsBlocked",
			measurements: [
				null,
				{},
				{ id: "stitched-ad-1", durationMilliseconds: 1000 },
			],
		},
	])(
		"preserves supported legacy forms and data for bounded sanitization: $key",
		(message) => {
			expect(decodeEvent(message)).toBe(message);
		},
	);

	it.each([
		{ key: "Pong", value: true },
		{ key: "AdDetected", continued: "true" },
		{ key: "AdDetected", cycleStartedAt: "1000" },
		{ key: "AdDetected", pageMediaKey: {} },
		{ key: "AdDetected", pageContextGeneration: Infinity },
		{ key: "AdDetected", detectedAt: Number.NaN },
		{ key: "AdDetected", codec: {} },
		{ key: "AdEnded", holdingBackup: "false" },
		{ key: "ReloadPlayer", newMediaPlayerInstance: 1 },
		{ key: "ReloadPlayer", refreshAccessToken: "false" },
		{ key: "ReloadPlayer", reason: {} },
		{ key: "ReloadPlayer", handoffId: 1 },
		{ key: "PauseResumePlayer", mediaKey: [] },
		{ key: "AdBlocked", count: "3" },
		{ key: "AdBlocked", delta: Infinity },
		{ key: "AdSecondsBlocked", measurements: {} },
		{ key: "AdSecondsBlocked", seconds: "22" },
		{ key: "AdPodProgress", adIds: ["ad-1", {}] },
		{ key: "AdPodProgress", expectedPodLength: "2" },
		{ key: "BackupPlayerTypeSelected", value: {} },
		{ key: "PlaybackWorkerObserved", decoderCodec: [] },
		{ key: "PlaybackWorkerBootstrapObserved", vodID: {} },
		{ key: "MediaBootstrapRecoveryNeeded", cycleStartedAt: Infinity },
		{ key: "VodAdRequestBlocked", sessionID: {} },
		{ key: "PreviewMasterRecoveryFailed", reportedAt: "1200" },
		{ key: "FatalMediaRecoveryReady", recoveryId: 1 },
		{
			key: "FatalMediaRecoveryReady",
			recoveryId: "recovery-1000",
			requiresCodecHandoff: "false",
		},
		{ key: "PostAdNativeReloadReady", loaderEpoch: "2" },
		{ key: "PostAdNativeSession", resolution: 1440 },
		{ key: "NativePlaybackRestored", continuePlayback: 1 },
		{ key: "LogEntry", value: [] },
		{ key: "WorkerErrorDiagnostic", value: "worker failed" },
		{ key: "CancelFetchRequest", value: { id: {} } },
		{ key: "FetchRequest", value: {} },
		{ key: "FetchRequest", value: { id: "fetch-1", url: {} } },
		...[
			[],
			{ headers: { token: 1 } },
			{ headers: [["token", 1]] },
			{ body: {} },
			{ method: null },
			{ mode: "invalid" },
			{ keepalive: "false" },
		].map((options) => ({
			key: "FetchRequest",
			value: { id: "fetch-1", url: "https://gql.twitch.tv/gql", options },
		})),
		{ key: "UpdateToggleState", value: false },
		{ key: "UnknownEvent" },
	])("rejects malformed or wrong-direction events: $key", (message) => {
		expect(decodeEvent(message)).toBeNull();
	});

	it("requires the worker envelope before decoding events", () => {
		for (const value of [
			null,
			[],
			{ key: "Pong" },
			{ __ttvabWorkerBridge: false, message: { key: "Pong" } },
			{ __ttvabWorkerBridge: true, message: [] },
		]) {
			expect(scope._getWorkerEvent(value)).toBeNull();
		}
	});
});

const commandPayloads = {
	UpdateClientVersion: "version",
	UpdateClientSession: "session",
	UpdateDeviceId: "device",
	UpdateClientIntegrityHeader: "integrity",
	UpdateAuthorizationHeader: "authorization",
	UpdateToggleState: true,
	UpdateAdSpoofingState: false,
	UpdateAutoplayBackupState: false,
	UpdateAdsBlocked: 4,
	UpdateGQLHash: "hash",
	UpdateLastNativePlaybackAccessTokenPlayerType: "site",
	UpdatePlayerHasPlayedOnce: true,
	UpdatePlayerIsPlaying: true,
	Ping: null,
	UpdatePageContext: {
		mediaKey: "live:buildtest",
		playbackContextGeneration: 2,
		allowPreviewEmergencyAutoplayBackup: false,
		preservedMediaKey: "live:pip",
	},
	UpdatePreferredQualityGroup: "1440p60",
	UpdatePagePlaybackVisibleSinceAt: 1000,
	UpdateCurrentAdContext: { channelName: "buildtest" },
	UpdateLastAdEndContext: {
		mediaKey: "live:buildtest",
		endedAt: 2000,
		cycleStartedAt: 1000,
	},
	UpdateAdPodProgress: {
		mediaKey: "live:buildtest",
		adIds: ["ad-1"],
		expectedPodLength: 2,
		maxAdPodPosition: 1,
		observedZeroAdPodPosition: true,
		cycleStartedAt: 1000,
		updatedAt: 1100,
	},
	ClearAdPodProgress: {
		mediaKey: "live:buildtest",
		beforeCycleStartedAt: 1000,
	},
	ResetAdCycleState: { mediaKey: "live:buildtest", cycleStartedAt: 1000 },
	UpdatePinnedBackupPlayerContext: {
		mediaKey: "live:buildtest",
		type: "site",
		cycleStartedAt: 1000,
	},
	PrepareFatalMediaRecovery: {
		mediaKey: "live:buildtest",
		recoveryId: "recovery",
		recoveryKind: "unready",
		requestedAt: 1200,
		cycleStartedAt: 1000,
	},
	UpdateCodecHandoffContext: {
		mediaKey: "live:buildtest",
		handoffId: "handoff",
		cycleStartedAt: 1000,
	},
	CodecHandoffReloadFailed: {
		mediaKey: "live:buildtest",
		handoffId: "handoff",
		cycleStartedAt: 1000,
	},
	UpdateBackupSearchForceRefresh: 1200,
	ResetPlaybackRecoveryState: {
		clearAdContext: true,
		previousMediaKey: "live:retired",
		preservedMediaKey: "live:pip",
	},
	ReleasePlaybackContext: { mediaKey: "live:retired" },
	FetchResponse: {
		id: "fetch-1",
		status: 200,
		statusText: "OK",
		ok: true,
		redirected: true,
		type: "basic",
		url: "https://example.invalid/media.m3u8",
		headers: { "content-type": "application/vnd.apple.mpegurl" },
		body: "#EXTM3U",
	},
	PreparePostAdNativeReload: {
		mediaKey: "live:buildtest",
		cycleStartedAt: 1000,
		reloadAt: 2000,
		preserveNativeSession: true,
		reason: "post-ad-native-restore",
	},
	ReleasePostAdNativeSession: {
		mediaKey: "live:buildtest",
		cycleStartedAt: 1000,
		reloadAt: 2000,
	},
	TriggeredPlayerReload: {
		mediaKey: "live:buildtest",
		cycleStartedAt: 1000,
		reloadAt: 2000,
		reason: "post-ad-native-restore",
	},
};

describe("worker command boundary", () => {
	it.each(Object.entries(commandPayloads))(
		"accepts the %s payload without rewriting ownership or values",
		(key, value) => {
			const message = { key, value, targetMediaKey: "live:buildtest" };
			expect(decode(message)).toBe(message);
		},
	);

	it.each([
		{ key: "Ping" },
		{ key: "UpdateAuthorizationHeader", value: null },
		{ key: "UpdatePreferredQualityGroup", value: null },
		{ key: "UpdateCurrentAdContext", value: null },
		{ key: "UpdatePinnedBackupPlayerContext", value: null },
		{ key: "TriggeredPlayerReload", value: null },
		{ key: "FetchResponse", value: { id: "fetch-1", error: "timeout" } },
		{
			key: "UpdatePageContext",
			value: { MediaType: "vod", VodID: 123, MediaKey: "vod:123" },
		},
		{
			key: "UpdateCodecHandoffContext",
			value: { mediaKey: "live:buildtest", clearHandoffId: "handoff" },
		},
	])("preserves supported clearing and legacy forms: $key", (message) => {
		expect(decode(message)).toBe(message);
	});

	it.each([
		{ key: "UpdateToggleState", value: "false" },
		{ key: "UpdateAutoplayBackupState", value: 1 },
		{ key: "UpdateDeviceId", value: { id: "device" } },
		{ key: "UpdateAdsBlocked", value: Number.NaN },
		{ key: "UpdatePagePlaybackVisibleSinceAt", value: Infinity },
		{ key: "UpdatePageContext", value: [] },
		{ key: "UpdatePageContext", value: { mediaKey: {} } },
		{ key: "UpdatePageContext", value: { playbackContextGeneration: "2" } },
		{ key: "UpdateAdPodProgress", value: { adIds: ["ad-1", {}] } },
		{ key: "UpdateAdPodProgress", value: { cycleStartedAt: Infinity } },
		{ key: "ClearAdPodProgress", value: {} },
		{ key: "PrepareFatalMediaRecovery", value: { recoveryId: {} } },
		{ key: "CodecHandoffReloadFailed", value: { handoffId: null } },
		{ key: "UpdateCodecHandoffContext", value: { handoffId: {} } },
		{ key: "ResetPlaybackRecoveryState", value: { clearAdContext: "false" } },
		{ key: "PreparePostAdNativeReload", value: { preserveNativeSession: 1 } },
		{
			key: "ReleasePostAdNativeSession",
			value: { mediaKey: "live:buildtest" },
		},
		{ key: "FetchResponse", value: { id: "fetch-1", headers: { test: 1 } } },
		{ key: "FetchResponse", value: { id: "fetch-1", status: "200" } },
		{ key: "FetchResponse", value: { id: "fetch-1", body: {} } },
		{ key: "UpdateToggleState", value: true, targetMediaKey: {} },
		{ key: "UpdateToggleState", value: true, mediaKey: {} },
		{ key: "UpdateToggleState", value: true, channel: [] },
		{ key: "UpdateToggleState", value: true, handoffId: 1 },
		{ key: "UnknownCommand", value: true },
		{ key: "AdDetected", mediaKey: "live:buildtest" },
	])("rejects malformed or wrong-direction input: $key", (message) => {
		expect(decode(message)).toBeNull();
	});

	it("requires the existing worker envelope before decoding commands", () => {
		for (const value of [
			null,
			[],
			{ key: "UpdateToggleState", value: false },
			{ __ttvabWorkerBridge: false, message: { key: "Ping" } },
			{ __ttvabWorkerBridge: true, message: [] },
		]) {
			expect(scope._getWorkerCommand(value)).toBeNull();
		}
	});
});

function contractDiagnostics(source: string) {
	const configPath = resolve(root, "tsconfig.modules.json");
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	const fileName = resolve(root, "src/modules/worker-contract-fixture.ts");
	const options: ts.CompilerOptions = {
		...parsed.options,
		composite: false,
		incremental: false,
		noEmit: true,
	};
	const host = ts.createCompilerHost(options);
	const readSourceFile = host.getSourceFile.bind(host);
	host.getSourceFile = (name, languageVersion, ...rest) =>
		name === fileName
			? ts.createSourceFile(name, source, languageVersion, true)
			: readSourceFile(name, languageVersion, ...rest);
	const program = ts.createProgram(
		[...parsed.fileNames, fileName],
		options,
		host,
	);
	return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
		file: diagnostic.file?.fileName,
		line:
			diagnostic.file && diagnostic.start !== undefined
				? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line +
					1
				: 0,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
	}));
}

describe("worker TypeScript contracts", () => {
	it("accepts every command and event and narrows payloads at actual senders and consumers", () => {
		const source = `const _contractPayloads = ${JSON.stringify(commandPayloads)} satisfies TTVABWorkerCommandPayloads;
const _eventContractPayloads = ${JSON.stringify(eventPayloads)} satisfies TTVABWorkerEventPayloads;
_broadcastWorkers({ key: "UpdateToggleState", value: true });
_postWorkerBridgeMessage(self, { key: "UpdatePageContext", value: { mediaKey: "live:buildtest" } });
_postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({ key: "AdDetected", mediaKey: "live:buildtest", continued: false }));
__TTVAB_STATE__.DisableAutoplayBackup = false;
__TTVAB_STATE__.AdRecoveryReloadCooldownMs = 30000;
__TTVAB_STATE__.ShouldResumeAfterAd = true;
__TTVAB_STATE__.LastPlayerReloadAtByMediaKey["live:buildtest"] = 1000;
__TTVAB_STATE__.AdSegmentCache.set("https://example.invalid/ad.ts", 1000);
__TTVAB_STATE__.SegmentCodecOwners.set("https://example.invalid/live.ts", { codecFamily: "avc", mediaKey: "live:buildtest", recordedAt: 1000, ambiguous: false });
__TTVAB_STATE__.PendingFetchRequests.get("fetch-1")?.resolve({ id: "fetch-1", body: "response" });
void __TTVAB_STATE__.PrepareFatalMediaRecovery?.({ recoveryId: "recovery-1", mediaKey: "live:buildtest", cycleStartedAt: 1000 });
__TTVAB_STATE__.StreamInfos["live:buildtest"] = _createStreamInfo({ mediaKey: "live:buildtest" });
const _runtimeStateHasNoIndex: string extends keyof TTVABRuntimeState ? false : true = true;
function _contractNarrowing(command: TTVABWorkerCommand, seed: TTVABWorkerSeed) {
    if (command.key === "UpdateToggleState") { const enabled: boolean = command.value; seed.state.IsAdStrippingEnabled = enabled; }
    if (command.key === "UpdatePageContext") { const mediaKey: string | null = command.value.mediaKey; seed.state.PageMediaKey = mediaKey; }
}
function _eventContractNarrowing(input: unknown) {
    const event = _getWorkerEvent(input);
    if (event?.key === "ReloadPlayer") { const rebuild: boolean = event.newMediaPlayerInstance; _postWorkerBridgeMessage(self, { key: "ReloadPlayer", newMediaPlayerInstance: rebuild }); }
    if (event?.key === "FetchRequest") { const url: string = event.value.url; _postWorkerBridgeMessage(self, { key: "FetchRequest", value: { id: "fetch-1", url } }); }
}`;
		expect(contractDiagnostics(source)).toEqual([]);
	});

	it("rejects incorrect command and event payloads and typed state writes in the real project", () => {
		const statements = [
			'_broadcastWorkers({ key: "UpdateToggleState", value: "false" });',
			'_postWorkerBridgeMessage(self, { key: "UpdateAdsBlocked", value: "4" });',
			'_broadcastWorkers({ key: "MisspelledCommand", value: true });',
			'_broadcastWorkers({ key: "ReleasePostAdNativeSession", value: { mediaKey: "live:buildtest" } });',
			'__TTVAB_STATE__.DisableAutoplayBackup = "false";',
			"__TTVAB_STATE__.PageMediaKey = {};",
			'__TTVAB_STATE__.AdPodProgressByMediaKey["live:buildtest"] = { adIds: [3] };',
			'function _contractWrongPayload(command: TTVABWorkerCommand) { if (command.key === "UpdateToggleState") command.value.toUpperCase(); }',
			'_postWorkerBridgeMessage(self, { key: "AdDetected", continued: "false" });',
			'_postWorkerBridgeMessage(self, { key: "FetchRequest", value: { id: "fetch-1", url: {} } });',
			'_createPageScopedWorkerEvent({ key: "ReloadPlayer", newMediaPlayerInstance: "false" });',
			'_createPageScopedWorkerEvent({ key: "ReloadPlayer", newMediaPlayerInstnce: false });',
			'_postWorkerBridgeMessage(self, { key: "LogEntry", value: { m: {} } });',
			'function _eventContractWrongPayload(event: TTVABReceivedWorkerEvent) { if (event.key === "AdEnded") event.endedAt.toUpperCase(); }',
			'function _eventContractUnsanitizedLog(event: TTVABReceivedWorkerEvent) { if (event.key === "LogEntry") event.value.m.toUpperCase(); }',
			'__TTVAB_STATE__.AdRecoveryReloadCooldownMs = "30000";',
			'__TTVAB_STATE__.ShouldResumeAfterAd = "false";',
			'__TTVAB_STATE__.LastPlayerReloadAtByMediaKey["live:buildtest"] = true;',
			'__TTVAB_STATE__.AdSegmentCache.set("https://example.invalid/ad.ts", "1000");',
			'__TTVAB_STATE__.SegmentCodecOwners.set("https://example.invalid/live.ts", { codecFamily: "audio", mediaKey: "live:buildtest", recordedAt: 1000, ambiguous: false });',
			'__TTVAB_STATE__.PendingFetchRequests.get("fetch-1")?.resolve({ id: "fetch-1", body: {} });',
			"__TTVAB_STATE__.PrepareFatalMediaRecovery?.({ recoveryId: 123 });",
			'__TTVAB_STATE__.StreamInfos["live:buildtest"].MediaKey = 123;',
			"__TTVAB_STATE__.LastPlayerRelodAt = 1000;",
		];
		const diagnostics = contractDiagnostics(statements.join("\n"));
		expect([
			...new Set(diagnostics.map((diagnostic) => diagnostic.line)),
		]).toEqual(statements.map((_, index) => index + 1));
		expect(
			diagnostics.every((diagnostic) =>
				diagnostic.file?.endsWith("worker-contract-fixture.ts"),
			),
		).toBe(true);
	});
});

describe("stream state TypeScript contracts", () => {
	it("types factory records, nested recovery state, and actual stream consumers", () => {
		const source = `const _streamContract = _createStreamInfo({ mediaKey: "live:buildtest" });
const _streamHasNoIndex: string extends keyof TTVABStreamInfo ? false : true = true;
const _pagePlaylistContract: TTVABPagePlaylistState = { MediaKey: "live:buildtest", MediaType: "live", PageContextGeneration: 1, UsherBaseUrl: "https://example.invalid/native.m3u8", _EmptyAdHoldMediaSequence: 0, _EmptyAdHoldDiscontinuitySequence: 0, _EmptyAdHoldProgramDateTime: 0, _EmptyAdHoldWindow: null, _EmptyHoldTimelineByUrl: new Map(), _LivePlaylistTimeline: null, NumStrippedAdSegments: 0, IsStrippingAdSegments: false };
_pageSideEmptyHoldInfoByUrl.set("native", _pagePlaylistContract);
_applyPlaylistContinuity(_pagePlaylistContract, "https://example.invalid/native.m3u8", "#EXTM3U");
_stripAds("#EXTM3U", false, _pagePlaylistContract);
type _StreamAnyFields = { [Key in keyof TTVABStreamInfo]-?: 0 extends (1 & TTVABStreamInfo[Key]) ? Key : never }[keyof TTVABStreamInfo];
const _streamHasNoAnyFields: [_StreamAnyFields] extends [never] ? true : false = true;
const _streamVariant = _getStreamVariantInfo({ RESOLUTION: "1920x1080", CODECS: "avc1" }, "native.m3u8", "https://example.invalid/native.m3u8");
_streamContract.ResolutionList.push(_streamVariant);
_streamContract.Urls[_streamVariant.Url] = _streamVariant;
_streamContract.SustainedNativeResolution = _streamVariant;
_streamContract.RequestedAds.add("https://example.invalid/ad.ts");
_streamContract._BackupSelection = { identity: "site-session", sequence: 1, refreshedSequence: 2 };
_streamContract.BackupEncodingsM3U8Cache.site = { m3u8: "#EXTM3U", baseUrl: "https://example.invalid/master.m3u8", viewerHeadersOmitted: false, cycleStartedAt: 1000 };
_streamContract._BackupProbation = { type: "site", at: 1100, cleanChecks: 1, cache: _streamContract.BackupEncodingsM3U8Cache.site, playlistUrl: "https://example.invalid/backup.m3u8", codec: "avc1", resolution: "1920x1080", mediaKey: "live:buildtest", pageMediaKey: "live:buildtest", pageGeneration: 1, cycleStartedAt: 1000, backupSearchEpoch: 1 };
_streamContract._NativePlaybackMaster = { master: "#EXTM3U", masterUrl: "https://example.invalid/master.m3u8", resolutionList: [_streamVariant], mediaKey: "live:buildtest", pageGeneration: 1, observedAt: 1000 };
_streamContract._PendingPostAdNativeMaster = { master: "#EXTM3U", masterUrl: "https://example.invalid/master.m3u8", playlistUrl: "https://example.invalid/native.m3u8", codec: "avc1", resolution: "1920x1080", mediaKey: "live:buildtest", cycleStartedAt: 1000, expiresAt: 31000, pageGeneration: 1, masterServedAt: 0, reloadAt: 0, reloadCount: 0, consumed: false };
_streamContract._PendingNativeReloadConfirmation = { mediaKey: "live:buildtest", pageMediaKey: "live:buildtest", pageGeneration: 1, cycleStartedAt: 1000, reloadAt: 2000, loaderEpoch: 1 };
_streamContract._PendingNativeReloadConfirmation.confirmed = true;
_streamContract._BackupSearchPromise = Promise.resolve({ type: "site", m3u8: "#EXTM3U" });
_streamContract._BackupSearchPromises.set("cycle-1", _streamContract._BackupSearchPromise);
_streamContract._EmptyAdHoldWindow = { cycleStartedAt: 1000, startedAt: 1000, firstSequence: 10, discontinuity: 2, programDateTime: 1000 };
_streamContract._EmptyHoldTimelineByUrl.set(_streamVariant.Url, { kind: "native", identity: "native-session", generation: 1, boundarySequence: 10, addBoundary: true, mediaOffset: 1, discontinuityOffset: 2, lastSequence: 12, lastDiscontinuity: 3, lastRawFirstSequence: 10, nativeAnchors: [{ time: 1000, duration: 2000, sequence: 10, discontinuity: 2 }] });
_streamContract._LivePlaylistTimeline = { identity: "native-session", backup: false, afterHold: false, minimumTime: 1000, lastEndTime: 3000, prefetchedSegments: [{ sourceUrl: _streamVariant.Url, url: "https://example.invalid/next.ts" }] };
_commitBackupPlaylist(_streamContract, "#EXTM3U", 2, { playerType: "site", playlistUrl: "https://example.invalid/backup.m3u8", sessionUrl: "https://example.invalid/master.m3u8", resolution: "1920x1080", codecFamily: "avc", codec: "avc1" });
_isBackupProbationCurrent(_streamContract, _streamContract._BackupProbation);
_applyPlaylistContinuity(_streamContract, _streamVariant.Url, "#EXTM3U");
_resetStreamAdState(_streamContract, true);
_invalidateAdCycleAsyncWork(_streamContract);
_updatePostAdNativeMasterReload(_streamContract, { mediaKey: "live:buildtest", cycleStartedAt: 1000, reloadAt: 2000, preserveNativeSession: true });`;
		expect(contractDiagnostics(source)).toEqual([]);
	});

	it("rejects misspelled fields, invalid nested writes, and incomplete ownership records", () => {
		const info = '__TTVAB_STATE__.StreamInfos["live:buildtest"]';
		const statements = [
			'_pageSideEmptyHoldInfoByUrl.get("native").PageContextGeneration = "1";',
			`${info}.LastCleanBackupPlayrType = "site";`,
			`${info}.LastCleanBackupM3U8 = 123;`,
			`${info}._BackupSelection = { identity: "site-session", sequence: "1", refreshedSequence: 2 };`,
			`${info}.BackupEncodingsM3U8Cache.site.viewerHeadersOmitted = "false";`,
			`${info}.BackupPlaylistMetadata.set("#EXTM3U", { codecFamily: "audio", codec: null, ambiguous: false });`,
			`${info}._BackupProbation.pageGeneration = "1";`,
			`${info}._NativePlaybackMaster = { master: "#EXTM3U", masterUrl: "https://example.invalid/master.m3u8", resolutionList: [] };`,
			`${info}._PendingPostAdNativeMaster = { master: "#EXTM3U", masterUrl: "https://example.invalid/master.m3u8", playlistUrl: "https://example.invalid/native.m3u8" };`,
			`${info}._PendingPostAdNativeMaster.loaderEpoch = "1";`,
			`${info}._PendingNativeReloadConfirmation.confirmed = "true";`,
			`${info}.RequestedAds.add(123);`,
			`${info}._BackupSearchPromise = Promise.resolve({ type: "site", m3u8: {} });`,
			`${info}._NoBackupRecoveryCandidates.get("site").cleanMediaSequence = "10";`,
			`${info}._EmptyAdHoldWindow.firstSequence = "10";`,
			`${info}._EmptyHoldTimelineByUrl.get("native").nativeAnchor.duration = "2000";`,
			`${info}._LivePlaylistTimeline.prefetchedSegments.push({ sourceUrl: 123, url: "https://example.invalid/next.ts" });`,
			'_createStreamInfo({ mediaKey: "live:buildtest" }).LastCleanBackupM3U8 = 123;',
			'_getStreamInfoForPlaylist("https://example.invalid/native.m3u8").NativeRecoveryCandidateStage = "unknown";',
			'_createSyntheticStreamInfo({ mediaKey: "live:buildtest" }).NativeRecoveryLoaderEpoch = "1";',
			"_createStreamInfo({ mediaKey: 123 });",
			`_commitBackupPlaylist(${info}, "#EXTM3U", "2", { playerType: "site", playlistUrl: "https://example.invalid/backup.m3u8", sessionUrl: "https://example.invalid/master.m3u8", resolution: "1920x1080", codecFamily: "avc", codec: "avc1" });`,
			`_isBackupProbationCurrent(${info}, { type: "site", at: 1100, cleanChecks: 1 });`,
		];
		const diagnostics = contractDiagnostics(statements.join("\n"));
		expect([
			...new Set(diagnostics.map((diagnostic) => diagnostic.line)),
		]).toEqual(statements.map((_, index) => index + 1));
		expect(
			diagnostics.every((diagnostic) =>
				diagnostic.file?.endsWith("worker-contract-fixture.ts"),
			),
		).toBe(true);
	});
});
