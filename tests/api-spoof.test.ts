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
let realFetchViaWorkerBridge: unknown;

type GqlPacket = {
	variables?: {
		input?: {
			eventName?: string;
			eventPayload?: string;
		};
	};
};

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
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/api.js");
	realFetchViaWorkerBridge = g._fetchViaWorkerBridge;
});

beforeEach(() => {
	g._log = () => {};
	g.__TTVAB_STATE__ = {
		DisableAdSpoofing: false,
		GQLDeviceID: "device",
		AuthorizationHeader: null,
		ClientIntegrityHeader: null,
		ClientVersion: null,
		ClientSession: null,
		LoggedAdSpoofBadStatus: false,
	};
	g._postWorkerBridgeMessage = () => true;
	g._createPageScopedWorkerEvent = (message: Record<string, unknown>) =>
		message;
});

afterEach(() => {
	delete g._fetchViaWorkerBridge;
	delete g._postWorkerBridgeMessage;
	delete g._createPageScopedWorkerEvent;
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function adRange(id: number) {
	return `#EXT-X-DATERANGE:ID="stitched-ad-${id}",CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-RADS-TOKEN="rad-${id}",X-TV-TWITCH-AD-POD-LENGTH="2",X-TV-TWITCH-AD-POD-POSITION="${id}",X-TV-TWITCH-AD-DURATION="15.000",X-TV-TWITCH-AD-ROLL-TYPE="PREROLL"`;
}

function adRangeNoPodLength(id: number) {
	return `#EXT-X-DATERANGE:ID="stitched-ad-${id}",CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-RADS-TOKEN="rad-${id}",X-TV-TWITCH-AD-POD-POSITION="${id}",X-TV-TWITCH-AD-DURATION="15.000",X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"`;
}

describe("_recordAdDurations", () => {
	function record() {
		return T<
			(
				text: string,
				info: {
					MeasuredAdIds: Set<string>;
					VisibleAdStartedAt: number;
					ChannelName: string;
					MediaKey: string;
				},
			) => void
		>("_recordAdDurations");
	}

	function makeInfo() {
		return {
			MeasuredAdIds: new Set<string>(),
			VisibleAdStartedAt: 123456,
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
	}

	it("records reordered standard DURATION metadata on the final line with millisecond precision", () => {
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		const info = makeInfo();
		const startDateMilliseconds = Date.parse("2026-08-12T10:00:00.000Z");

		record()(
			'#EXTM3U\n#EXT-X-DATERANGE:CLASS="twitch-stitched-ad",DURATION="15.050",START-DATE="2026-08-12T10:00:00.000Z",ID="stitched-ad-final"',
			info,
		);

		expect(messages).toEqual([
			{
				key: "AdSecondsBlocked",
				measurements: [
					{
						id: "stitched-ad-final",
						durationMilliseconds: 15050,
						startDateMilliseconds,
					},
				],
				cycleStartedAt: 123456,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			},
		]);
		expect(info.MeasuredAdIds).toEqual(
			new Set([`123456:stitched-ad-final:${startDateMilliseconds}`]),
		);
	});

	it("uses the Twitch duration fallback and reports each creative once per cycle", () => {
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		const info = makeInfo();
		const playlist =
			'#EXTM3U\r\n#EXT-X-DATERANGE:X-TV-TWITCH-AD-DURATION="15.900",DURATION="0",ID="stitched-ad-fallback"\r\n';

		record()(playlist, info);
		record()(playlist, info);
		info.VisibleAdStartedAt = 654321;
		record()(playlist, info);

		expect(messages).toHaveLength(2);
		expect(messages.map((message) => message.measurements)).toEqual([
			[{ id: "stitched-ad-fallback", durationMilliseconds: 15900 }],
			[{ id: "stitched-ad-fallback", durationMilliseconds: 15900 }],
		]);
	});

	it("rejects invalid, planned-only, and unbounded durations", () => {
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		const info = makeInfo();

		record()(
			[
				'#EXT-X-DATERANGE:ID="stitched-ad-zero",DURATION="0"',
				'#EXT-X-DATERANGE:ID="stitched-ad-planned",PLANNED-DURATION="30"',
				'#EXT-X-DATERANGE:ID="stitched-ad-long",DURATION="600.001"',
				'#EXT-X-DATERANGE:ID="stitched-ad-exponent",DURATION="1e2"',
				'#EXT-X-DATERANGE:ID="stitched-ad-hex",DURATION="0x10"',
				'#EXT-X-DATERANGE:ID="other-ad",DURATION="15"',
			].join("\n"),
			info,
		);

		expect(messages).toEqual([]);
		expect(info.MeasuredAdIds.size).toBe(0);
	});

	it("does not mark a duration delivered until the worker bridge accepts it", () => {
		let shouldAccept = false;
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return shouldAccept;
		};
		const info = makeInfo();
		const playlist = '#EXT-X-DATERANGE:ID="stitched-ad-retry",DURATION="30"';

		record()(playlist, info);
		expect(info.MeasuredAdIds.size).toBe(0);
		shouldAccept = true;
		record()(playlist, info);

		expect(messages).toHaveLength(2);
		expect(info.MeasuredAdIds.has("123456:stitched-ad-retry")).toBe(true);
	});

	it("bounds each worker message and delivers the remaining records on the next poll", () => {
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		const info = makeInfo();
		const playlist = Array.from(
			{ length: 60 },
			(_, index) =>
				`#EXT-X-DATERANGE:ID="stitched-ad-bounded-${index}",DURATION="1"`,
		).join("\n");

		record()(playlist, info);
		record()(playlist, info);
		record()(playlist, info);

		expect(messages).toHaveLength(2);
		expect(
			(messages[0].measurements as Array<Record<string, unknown>>).length,
		).toBe(50);
		expect(
			(messages[1].measurements as Array<Record<string, unknown>>).length,
		).toBe(10);
		expect(info.MeasuredAdIds.size).toBe(60);
	});
});

describe("_notifyAdComplete", () => {
	function captureWorkerMessages() {
		const messages: Array<Record<string, unknown>> = [];
		const previousPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		const previousCreatePageScopedWorkerEvent = g._createPageScopedWorkerEvent;
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		g._createPageScopedWorkerEvent = (message: Record<string, unknown>) =>
			message;
		return {
			messages,
			restore: () => {
				g._postWorkerBridgeMessage = previousPostWorkerBridgeMessage;
				g._createPageScopedWorkerEvent = previousCreatePageScopedWorkerEvent;
			},
		};
	}

	it("records declared pod progress even when spoofing is disabled", async () => {
		const notify =
			T<
				(
					text: string,
					info: {
						SpoofedAdIds: Set<string>;
						ObservedAdPodIds: Set<string>;
						ExpectedAdPodLength: number;
						VisibleAdStartedAt: number;
						ChannelName: string;
						MediaKey: string;
					},
				) => Promise<void>
			>("_notifyAdComplete");
		const info = {
			SpoofedAdIds: new Set<string>(),
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
			MaxObservedAdPodPosition: 0,
			ObservedZeroAdPodPosition: false,
			VisibleAdStartedAt: 123456,
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const capture = captureWorkerMessages();
		(g.__TTVAB_STATE__ as Record<string, unknown>).DisableAdSpoofing = true;

		try {
			await notify(["#EXTM3U", adRange(1)].join("\n").concat("\n"), info);
		} finally {
			capture.restore();
		}

		expect(info.ExpectedAdPodLength).toBe(2);
		expect(info.MaxObservedAdPodPosition).toBe(1);
		expect(info.ObservedZeroAdPodPosition).toBe(false);
		expect([...info.ObservedAdPodIds]).toEqual(["stitched-ad-1"]);
		expect(info.SpoofedAdIds.size).toBe(0);
		expect(capture.messages).toEqual([
			{
				key: "AdPodProgress",
				adIds: ["stitched-ad-1"],
				expectedPodLength: 2,
				maxAdPodPosition: 1,
				observedZeroAdPodPosition: false,
				cycleStartedAt: 123456,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			},
		]);
	});

	it("emits deduplicated cumulative pod IDs across playlist polls", async () => {
		const notify =
			T<
				(
					text: string,
					info: {
						SpoofedAdIds: Set<string>;
						ObservedAdPodIds: Set<string>;
						ExpectedAdPodLength: number;
						VisibleAdStartedAt: number;
						ChannelName: string;
						MediaKey: string;
					},
				) => Promise<void>
			>("_notifyAdComplete");
		const info = {
			SpoofedAdIds: new Set<string>(),
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
			VisibleAdStartedAt: 654321,
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const capture = captureWorkerMessages();
		(g.__TTVAB_STATE__ as Record<string, unknown>).DisableAdSpoofing = true;

		try {
			await notify(
				["#EXTM3U", adRange(1), adRange(1)].join("\n").concat("\n"),
				info,
			);
			await notify(
				["#EXTM3U", adRange(1), adRange(2), adRange(2)].join("\n").concat("\n"),
				info,
			);
		} finally {
			capture.restore();
		}

		expect(capture.messages).toHaveLength(2);
		expect(capture.messages.map((message) => message.adIds)).toEqual([
			["stitched-ad-1"],
			["stitched-ad-1", "stitched-ad-2"],
		]);
		expect(
			capture.messages.every(
				(message) =>
					message.expectedPodLength === 2 &&
					message.cycleStartedAt === 654321 &&
					message.channel === "testchannel" &&
					message.mediaKey === "live:testchannel",
			),
		).toBe(true);
		expect([...info.ObservedAdPodIds]).toEqual([
			"stitched-ad-1",
			"stitched-ad-2",
		]);
		expect(info.SpoofedAdIds.size).toBe(0);
	});

	it("does not spoof more ads than the declared pod length", async () => {
		const notify =
			T<
				(
					text: string,
					info: { SpoofedAdIds: Set<string>; ActiveBackupPlayerType: string },
				) => Promise<void>
			>("_notifyAdComplete");
		const batches: GqlPacket[][] = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			batches.push(JSON.parse(String(options.body || "[]")) as GqlPacket[]);
			return new Response(null, { status: 200 });
		};

		await notify(
			["#EXTM3U", adRange(1), adRange(2), adRange(3), adRange(4), adRange(5)]
				.join("\n")
				.concat("\n"),
			{ SpoofedAdIds: new Set<string>(), ActiveBackupPlayerType: "site" },
		);

		const packets = batches.flat();
		const podCompleteCount = packets.filter(
			(packet) =>
				packet.variables?.input?.eventName === "video_ad_pod_complete",
		).length;
		const payloads = packets
			.filter(
				(packet) =>
					packet.variables?.input?.eventName === "video_ad_impression",
			)
			.map((packet) =>
				JSON.parse(String(packet.variables?.input?.eventPayload || "{}")),
			) as Array<{ ad_id?: string; total_ads?: number }>;

		expect(batches).toHaveLength(2);
		expect(podCompleteCount).toBe(1);
		expect(payloads.map((payload) => payload.ad_id)).toEqual([
			"stitched-ad-1",
			"stitched-ad-2",
		]);
		expect(payloads.every((payload) => payload.total_ads === 2)).toBe(true);
	});

	it("keeps spoofing later ads across polls when no pod length is declared", async () => {
		const notify =
			T<
				(
					text: string,
					info: { SpoofedAdIds: Set<string>; ActiveBackupPlayerType: string },
				) => Promise<void>
			>("_notifyAdComplete");
		const batches: GqlPacket[][] = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			batches.push(JSON.parse(String(options.body || "[]")) as GqlPacket[]);
			return new Response(null, { status: 200 });
		};

		const sharedSpoofedIds = new Set<string>();
		const info = {
			SpoofedAdIds: sharedSpoofedIds,
			ActiveBackupPlayerType: "site",
		};

		await notify(
			["#EXTM3U", adRangeNoPodLength(1)].join("\n").concat("\n"),
			info,
		);
		await notify(
			["#EXTM3U", adRangeNoPodLength(2)].join("\n").concat("\n"),
			info,
		);

		const impressionIds = batches
			.flat()
			.filter(
				(packet) =>
					packet.variables?.input?.eventName === "video_ad_impression",
			)
			.map(
				(packet) =>
					(
						JSON.parse(
							String(packet.variables?.input?.eventPayload || "{}"),
						) as { ad_id?: string }
					).ad_id,
			);

		expect(impressionIds).toEqual(["stitched-ad-1", "stitched-ad-2"]);
	});

	it("never sends pod_complete when no pod length is declared", async () => {
		const notify =
			T<
				(
					text: string,
					info: { SpoofedAdIds: Set<string>; ActiveBackupPlayerType: string },
				) => Promise<void>
			>("_notifyAdComplete");
		const batches: GqlPacket[][] = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			batches.push(JSON.parse(String(options.body || "[]")) as GqlPacket[]);
			return new Response(null, { status: 200 });
		};

		const info = {
			SpoofedAdIds: new Set<string>(),
			ActiveBackupPlayerType: "site",
		};
		await notify(
			["#EXTM3U", adRangeNoPodLength(1)].join("\n").concat("\n"),
			info,
		);
		await notify(
			["#EXTM3U", adRangeNoPodLength(2)].join("\n").concat("\n"),
			info,
		);

		const podCompleteCount = batches
			.flat()
			.filter(
				(packet) =>
					packet.variables?.input?.eventName === "video_ad_pod_complete",
			).length;
		expect(podCompleteCount).toBe(0);
	});
});

describe("_createFetchRelayResponse", () => {
	const create = () =>
		T<(payload: Record<string, unknown>, url?: string | null) => Response>(
			"_createFetchRelayResponse",
		);

	it("builds a body-less response for null-body statuses", () => {
		const response = create()({
			status: 204,
			statusText: "No Content",
			headers: {},
			body: "",
		});
		expect(response.status).toBe(204);
		expect(response.body).toBe(null);
	});

	it("keeps the body for normal statuses", async () => {
		const response = create()({
			status: 200,
			statusText: "OK",
			headers: {},
			body: "hello",
		});
		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("hello");
	});
});

describe("_fetchViaWorkerBridge cancellation", () => {
	it("retires the exact page relay and clears worker pending state", async () => {
		const previousIsWorkerContext = g._isWorkerContext;
		const postMessage = vi.fn(() => true);
		const controller = new AbortController();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PendingFetchRequests = new Map();
		state.FetchRequestSeq = 0;
		g._isWorkerContext = () => true;
		g._postWorkerBridgeMessage = postMessage;
		const fetchViaBridge = realFetchViaWorkerBridge as (
			url: string,
			options: Record<string, unknown>,
			timeoutMs: number,
			requestSignal: AbortSignal,
		) => Promise<Response>;

		try {
			const pending = fetchViaBridge(
				"https://gql.twitch.tv/gql",
				{ method: "POST" },
				5000,
				controller.signal,
			);
			controller.abort();

			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
			expect(
				postMessage.mock.calls.map(
					([, message]) => (message as Record<string, unknown>).key,
				),
			).toEqual(["FetchRequest", "CancelFetchRequest"]);
			expect((state.PendingFetchRequests as Map<string, unknown>).size).toBe(0);
		} finally {
			g._isWorkerContext = previousIsWorkerContext;
		}
	});
});

describe("_getToken viewer header policy", () => {
	const getToken = () =>
		T<
			(
				playbackContext: Record<string, unknown>,
				playerType: string,
				realFetch: typeof fetch,
				omitViewerHeaders?: boolean,
			) => Promise<Response>
		>("_getToken");

	it("keeps viewer headers by default and omits only them for the bounded neutral retry", async () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.AuthorizationHeader = "OAuth viewer";
		state.ClientIntegrityHeader = "integrity";
		state.ClientVersion = "version";
		state.ClientSession = "session";
		state.GQLDeviceID = "device";
		const requests: Array<Record<string, unknown>> = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			requests.push(options);
			return new Response("{}", { status: 200 });
		};
		const context = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const unexpectedFetch = async () => {
			throw new Error("unexpected direct token fetch");
		};

		await getToken()(context, "site", unexpectedFetch, false);
		await getToken()(context, "site", unexpectedFetch, true);

		expect(requests).toHaveLength(2);
		const viewerHeaders = requests[0].headers as Record<string, string>;
		const neutralHeaders = requests[1].headers as Record<string, string>;
		expect(viewerHeaders).toMatchObject({
			"Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
			"X-Device-Id": "device",
			"Client-Version": "version",
			"Client-Session-Id": "session",
			"Client-Integrity": "integrity",
			Authorization: "OAuth viewer",
		});
		expect(neutralHeaders).toMatchObject({
			"Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
			"X-Device-Id": "device",
			"Client-Version": "version",
			"Client-Session-Id": "session",
		});
		expect(neutralHeaders).not.toHaveProperty("Client-Integrity");
		expect(neutralHeaders).not.toHaveProperty("Authorization");
		expect(requests[0].body).toBe(requests[1].body);
		expect(JSON.parse(String(requests[1].body))).toMatchObject({
			variables: {
				login: "testchannel",
				playerType: "site",
				platform: "web",
			},
		});
	});
});

describe("_notifyAdComplete (recent spoof dedup across bounces)", () => {
	const notify = () =>
		T<
			(
				text: string,
				info: {
					SpoofedAdIds: Set<string>;
					RecentSpoofedAdIds?: Map<string, number>;
					ActiveBackupPlayerType: string;
				},
			) => Promise<void>
		>("_notifyAdComplete");

	function captureBatches() {
		const batches: GqlPacket[][] = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			batches.push(JSON.parse(String(options.body || "[]")) as GqlPacket[]);
			return new Response(null, { status: 200 });
		};
		return batches;
	}

	function impressionIds(batches: GqlPacket[][]) {
		return batches
			.flat()
			.filter((p) => p.variables?.input?.eventName === "video_ad_impression")
			.map(
				(p) =>
					(
						JSON.parse(String(p.variables?.input?.eventPayload || "{}")) as {
							ad_id?: string;
						}
					).ad_id,
			);
	}

	it("does not re-spoof an ad already spoofed in a prior cycle", async () => {
		const batches = captureBatches();
		const info = {
			SpoofedAdIds: new Set<string>(),
			RecentSpoofedAdIds: new Map<string, number>([
				["stitched-ad-1", Date.now()],
			]),
			ActiveBackupPlayerType: "site",
		};

		await notify()(
			["#EXTM3U", adRangeNoPodLength(1)].join("\n").concat("\n"),
			info,
		);

		expect(impressionIds(batches)).toEqual([]);
		expect(info.SpoofedAdIds.has("stitched-ad-1")).toBe(true);
	});

	it("spoofs a genuinely new ad while skipping the recently spoofed one", async () => {
		const batches = captureBatches();
		const info = {
			SpoofedAdIds: new Set<string>(),
			RecentSpoofedAdIds: new Map<string, number>([
				["stitched-ad-1", Date.now()],
			]),
			ActiveBackupPlayerType: "site",
		};

		await notify()(
			["#EXTM3U", adRangeNoPodLength(1), adRangeNoPodLength(2)]
				.join("\n")
				.concat("\n"),
			info,
		);

		expect(impressionIds(batches)).toEqual(["stitched-ad-2"]);
		expect(info.SpoofedAdIds.has("stitched-ad-2")).toBe(true);
	});

	it("works without a recent map (backward compatible)", async () => {
		const batches = captureBatches();
		const info = {
			SpoofedAdIds: new Set<string>(),
			ActiveBackupPlayerType: "site",
		};

		await notify()(
			["#EXTM3U", adRangeNoPodLength(1)].join("\n").concat("\n"),
			info,
		);

		expect(impressionIds(batches)).toEqual(["stitched-ad-1"]);
	});
});

describe("_getToken (exhausted-failure sentinel)", () => {
	let savedFetchWithTimeout: unknown;

	beforeEach(() => {
		savedFetchWithTimeout = g._fetchWithTimeout;
		g._fetchWithTimeout = async (
			fetchFunc: (url: string, options: unknown) => Promise<Response>,
			url: string,
			options: unknown,
		) => fetchFunc(url, options);
	});

	afterEach(() => {
		g._fetchWithTimeout = savedFetchWithTimeout;
	});

	it("returns a non-throwing network-error response when every fetch path fails", async () => {
		const getToken =
			T<
				(
					ctx: unknown,
					playerType: string,
					realFetch: unknown,
				) => Promise<Response>
			>("_getToken");
		g._fetchViaWorkerBridge = async () => null;
		const failingFetch = async () => {
			throw new Error("connection refused");
		};

		const res = await getToken("somechannel", "site", failingFetch);
		expect(res).toBeInstanceOf(Response);
		expect(res.status).toBe(0);
		expect(res.ok).toBe(false);
	});

	it("retries timeout-class errors before giving up", async () => {
		const getToken =
			T<
				(
					ctx: unknown,
					playerType: string,
					realFetch: unknown,
				) => Promise<Response>
			>("_getToken");
		g._fetchViaWorkerBridge = async () => null;
		let attempts = 0;
		const timeoutFetch = async () => {
			attempts++;
			const err = new Error("fetch relay timeout");
			err.name = "AbortError";
			throw err;
		};

		const res = await getToken("somechannel", "site", timeoutFetch);
		expect(attempts).toBe(3);
		expect(res.status).toBe(0);
	});

	it("does not retry or fall through to direct fetch after route cancellation", async () => {
		const getToken =
			T<
				(
					ctx: unknown,
					playerType: string,
					realFetch: unknown,
					omitViewerHeaders: boolean,
					requestDeadlineAt: number,
					requestSignal: AbortSignal,
				) => Promise<Response>
			>("_getToken");
		const controller = new AbortController();
		let markRelayStarted: (() => void) | null = null;
		const relayStarted = new Promise<void>((resolve) => {
			markRelayStarted = resolve;
		});
		const relay = vi.fn(
			(
				_url: string,
				_options: unknown,
				_timeoutMs: number,
				requestSignal: AbortSignal,
			) =>
				new Promise<Response>((_resolve, reject) => {
					markRelayStarted?.();
					requestSignal.addEventListener(
						"abort",
						() => reject(new DOMException("retired", "AbortError")),
						{ once: true },
					);
				}),
		);
		g._fetchViaWorkerBridge = relay;
		const directFetch = vi.fn();
		const pending = getToken(
			"somechannel",
			"site",
			directFetch,
			false,
			0,
			controller.signal,
		);
		await relayStarted;
		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(relay).toHaveBeenCalledOnce();
		expect(directFetch).not.toHaveBeenCalled();
	});

	it("stops a token relay at the caller's overall search deadline", async () => {
		vi.useFakeTimers({ now: 100_000 });
		const getToken =
			T<
				(
					ctx: unknown,
					playerType: string,
					realFetch: unknown,
					omitViewerHeaders?: boolean,
					requestDeadlineAt?: number,
				) => Promise<Response>
			>("_getToken");
		const relayTimeouts: number[] = [];
		g._fetchViaWorkerBridge = (
			_url: string,
			_options: unknown,
			timeoutMs: number,
		) => {
			relayTimeouts.push(timeoutMs);
			return new Promise((_resolve, reject) => {
				setTimeout(() => {
					const error = new Error("fetch relay timeout");
					error.name = "TimeoutError";
					reject(error);
				}, timeoutMs);
			});
		};
		const directFetch = vi.fn(async () => new Response(null, { status: 200 }));

		try {
			const pending = getToken(
				"somechannel",
				"site",
				directFetch,
				false,
				101_000,
			);
			await vi.advanceTimersByTimeAsync(1000);
			const response = await pending;

			expect(relayTimeouts).toEqual([1000]);
			expect(directFetch).not.toHaveBeenCalled();
			expect(response.status).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
