import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { loadModule, T } from "./helpers/runtime";

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
		AdSpoofFailureCount: 0,
		LastAdSpoofFailureLogAt: 0,
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

	it("measures an ad that declares only an end date", () => {
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};

		record()(
			'#EXT-X-DATERANGE:ID="stitched-ad-end",CLASS="twitch-stitched-ad",START-DATE="2026-10-16T10:00:00.000Z",END-DATE="2026-10-16T10:00:30.250Z"',
			makeInfo(),
		);

		expect(messages.map((message) => message.measurements)).toEqual([
			[
				{
					id: "stitched-ad-end",
					durationMilliseconds: 30250,
					startDateMilliseconds: Date.parse("2026-10-16T10:00:00.000Z"),
				},
			],
		]);
	});

	it("logs once per break when the two declared durations disagree and uses the standard one", () => {
		const logs: string[] = [];
		g._log = (message: string) => logs.push(message);
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
				'#EXT-X-DATERANGE:ID="stitched-ad-a",DURATION=30.000,X-TV-TWITCH-AD-DURATION="15"',
				'#EXT-X-DATERANGE:ID="stitched-ad-b",DURATION=20.000,X-TV-TWITCH-AD-DURATION="10"',
				'#EXT-X-DATERANGE:ID="stitched-ad-c",DURATION=12.200,X-TV-TWITCH-AD-DURATION="12"',
			].join("\n"),
			info,
		);

		expect(logs).toEqual([
			"[Trace] stitched-ad-a declares DURATION 30.0s but X-TV-TWITCH-AD-DURATION 15.0s; Time Saved uses 30.0s",
		]);
		expect(
			(messages[0].measurements as Array<{ durationMilliseconds: number }>).map(
				(measurement) => measurement.durationMilliseconds,
			),
		).toEqual([30000, 20000, 12200]);
	});

	it("totals the delivered ads per break and tracks ads still missing a duration", () => {
		let accept = false;
		g._postWorkerBridgeMessage = () => accept;
		const info = makeInfo() as ReturnType<typeof makeInfo> & {
			_AdBreakMeasurement?: {
				cycleStartedAt: number;
				ads: number;
				milliseconds: number;
				unmeasuredAdIds: Set<string>;
			};
		};
		const pending = '#EXT-X-DATERANGE:ID="stitched-ad-late"';
		const ready = '#EXT-X-DATERANGE:ID="stitched-ad-late",DURATION="15.5"';
		const second = '#EXT-X-DATERANGE:ID="stitched-ad-next",DURATION="30"';

		record()(pending, info);
		expect(info._AdBreakMeasurement).toMatchObject({
			cycleStartedAt: 123456,
			ads: 0,
			milliseconds: 0,
		});
		expect([...(info._AdBreakMeasurement?.unmeasuredAdIds || [])]).toEqual([
			"123456:stitched-ad-late",
		]);

		record()(ready, info);
		expect(info._AdBreakMeasurement?.ads).toBe(0);
		accept = true;
		record()(`${ready}\n${second}`, info);
		record()(`${pending}\n${second}`, info);

		expect(info._AdBreakMeasurement).toMatchObject({
			ads: 2,
			milliseconds: 45500,
		});
		expect(info._AdBreakMeasurement?.unmeasuredAdIds.size).toBe(0);

		info.VisibleAdStartedAt = 654321;
		record()(second, info);
		expect(info._AdBreakMeasurement).toMatchObject({
			cycleStartedAt: 654321,
			ads: 1,
			milliseconds: 30000,
		});
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
				pod: {
					key: "preroll|2",
					length: 2,
					adIds: ["stitched-ad-1"],
					maxPosition: 1,
					zeroPosition: false,
				},
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

	it.each([
		{
			label: "a preroll pod followed by an eight-ad midroll pod",
			pods: [
				{ roll: "PREROLL", prefix: "pre", length: 1 },
				{ roll: "MIDROLL", prefix: "mid", length: 8 },
			],
		},
		{
			label: "two consecutive midroll pods of the same length",
			pods: [
				{ roll: "MIDROLL", prefix: "first", length: 2 },
				{ roll: "MIDROLL", prefix: "second", length: 2 },
			],
		},
	])(
		"reports every ad and completes each pod once for $label",
		async ({ pods }) => {
			const notify =
				T<(text: string, info: Record<string, unknown>) => Promise<void>>(
					"_notifyAdComplete",
				);
			const batches: GqlPacket[][] = [];
			g._fetchViaWorkerBridge = async (
				_url: string,
				options: Record<string, unknown>,
			) => {
				batches.push(JSON.parse(String(options.body || "[]")) as GqlPacket[]);
				return new Response(null, { status: 200 });
			};
			const ads = pods.flatMap(({ roll, prefix, length }) =>
				Array.from(
					{ length },
					(_, position) =>
						`#EXT-X-DATERANGE:ID="stitched-ad-${prefix}-${position}",CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-RADS-TOKEN="rad-${prefix}-${position}",X-TV-TWITCH-AD-POD-LENGTH="${length}",X-TV-TWITCH-AD-POD-POSITION="${position}",X-TV-TWITCH-AD-ROLL-TYPE="${roll}"`,
				),
			);
			const info = {
				SpoofedAdIds: new Set<string>(),
				RecentSpoofedAdIds: new Map<string, number>(),
				ObservedAdPodIds: new Set<string>(),
				ExpectedAdPodLength: 0,
				MaxObservedAdPodPosition: 0,
				ObservedZeroAdPodPosition: false,
				CurrentAdPod: null,
				ActiveBackupPlayerType: "autoplay",
			};

			for (let end = 1; end <= ads.length; end++) {
				await notify(
					["#EXTM3U", ...ads.slice(Math.max(0, end - 3), end)].join("\n"),
					info,
				);
			}

			const events = batches.map((batch) =>
				batch.map((packet) => {
					const input = packet.variables?.input;
					return {
						event: input?.eventName,
						payload: JSON.parse(String(input?.eventPayload || "{}")) as {
							ad_id?: string;
							total_ads?: number;
						},
					};
				}),
			);
			const impressions = events
				.flat()
				.filter(({ event }) => event === "video_ad_impression");
			expect(impressions.map(({ payload }) => payload.ad_id)).toEqual(
				ads.map((line) => line.match(/ID="([^"]+)"/)?.[1]),
			);
			expect(impressions.map(({ payload }) => payload.total_ads)).toEqual(
				pods.flatMap(({ length }) => Array(length).fill(length)),
			);
			const completedAfter = events
				.filter((batch) =>
					batch.some(({ event }) => event === "video_ad_pod_complete"),
				)
				.map(
					(batch) =>
						batch.find(({ event }) => event === "video_ad_impression")?.payload
							.ad_id,
				);
			expect(completedAfter).toEqual(
				pods.map(({ prefix, length }) => `stitched-ad-${prefix}-${length - 1}`),
			);
		},
	);

	it("keeps reporting rejected ad completion requests with a running count", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const log = vi.fn();
		g._log = log;
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		let status = 403;
		g._fetchViaWorkerBridge = async () => {
			if (status === 0) throw new Error("fetch relay timeout");
			return new Response(null, { status });
		};
		const failures = () =>
			log.mock.calls
				.map(([message]) => String(message))
				.filter((message) => message.startsWith("notifyAdComplete:"));
		try {
			for (const id of [1, 2]) {
				await notify(["#EXTM3U", adRange(id)].join("\n"), {
					SpoofedAdIds: new Set<string>(),
				});
			}
			await vi.advanceTimersByTimeAsync(0);
			expect(failures()).toEqual([
				"notifyAdComplete: GQL response status 403 (1 failed report so far); Twitch may be rejecting or rate-limiting ad completion reports",
			]);
			vi.setSystemTime(1_000_000 + 600_000);
			status = 0;
			await notify(["#EXTM3U", adRange(3)].join("\n"), {
				SpoofedAdIds: new Set<string>(),
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(failures().at(-1)).toBe(
				"notifyAdComplete: fetch relay timeout (3 failed reports so far); Twitch may be rejecting or rate-limiting ad completion reports",
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("counts a 200 response that carries GraphQL errors as a failed report", async () => {
		const log = vi.fn();
		g._log = log;
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		g._fetchViaWorkerBridge = async () =>
			Response.json([
				{
					errors: [
						{
							message: 'PersistedQueryNotFound <token="secret">',
							extensions: { code: "PERSISTED_QUERY_NOT_FOUND" },
						},
					],
				},
			]);
		await notify(["#EXTM3U", adRange(1)].join("\n"), {
			SpoofedAdIds: new Set<string>(),
		});
		for (let index = 0; index < 5; index++) await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(
			log.mock.calls
				.map(([message]) => String(message))
				.filter((message) => message.startsWith("notifyAdComplete:")),
		).toEqual([
			"notifyAdComplete: GQL error PersistedQueryNotFound tokensecret (1 failed report so far); Twitch may be rejecting or rate-limiting ad completion reports",
		]);
	});

	it("does not count a successful GraphQL response as a failure", async () => {
		const log = vi.fn();
		g._log = log;
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		g._fetchViaWorkerBridge = async () =>
			Response.json([{ data: { recordAdEvent: { error: null } } }]);
		await notify(["#EXTM3U", adRange(1)].join("\n"), {
			SpoofedAdIds: new Set<string>(),
			ActiveBackupPlayerType: "autoplay",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		const messages = log.mock.calls.map(([message]) => String(message));
		expect(
			messages.filter((message) => message.startsWith("notifyAdComplete:")),
		).toEqual([]);
		expect(messages).toContain(
			"[Trace] Sent ad completion for 1 new ad(s) (1/2 pod) — roll: preroll, serving: autoplay, pod-complete: no",
		);
	});

	it("warns about missing ad metadata once per ad break", async () => {
		const log = vi.fn();
		g._log = log;
		g._fetchViaWorkerBridge = async () => new Response(null, { status: 200 });
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		const info: Record<string, unknown> = {
			SpoofedAdIds: new Set<string>(),
			_LoggedWhitelistByType: null,
		};
		const noMatch =
			'#EXTM3U\n#EXT-X-DATERANGE:ID="csai-1",CLASS="twitch-ad",X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"';
		const noToken =
			'#EXTM3U\n#EXT-X-DATERANGE:ID="stitched-ad-9",CLASS="twitch-stitched-ad"';
		const warnings = () =>
			log.mock.calls
				.map(([message]) => String(message))
				.filter((message) => message.startsWith("notifyAdComplete:"));
		for (const text of [noMatch, noMatch, noToken, noToken])
			await notify(text, info);
		expect(warnings()).toHaveLength(2);
		expect(warnings()[0]).toMatch(
			/^notifyAdComplete: no stitched-ad DATERANGE match in this ad break; no completion reports sent\./,
		);
		expect(warnings()[1]).toMatch(
			/^notifyAdComplete: matched DATERANGE but no RADS token in this ad break; no completion report sent\./,
		);
		info._LoggedWhitelistByType = null;
		await notify(noMatch, info);
		await notify(noToken, info);
		expect(warnings()).toHaveLength(4);
	});

	it("shares reported ad IDs so a replacement worker does not report them again", async () => {
		const sent: string[] = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: { body: string },
		) => {
			for (const packet of JSON.parse(options.body) as GqlPacket[]) {
				const payload = JSON.parse(
					packet.variables?.input?.eventPayload || "{}",
				);
				if (packet.variables?.input?.eventName === "video_ad_impression")
					sent.push(payload.ad_id);
			}
			return new Response(null, { status: 200 });
		};
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => {
			messages.push(message);
			return true;
		};
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		const makeWorkerInfo = () => ({
			SpoofedAdIds: new Set<string>(),
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
			MaxObservedAdPodPosition: 0,
			ObservedZeroAdPodPosition: false,
			VisibleAdStartedAt: 5000,
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		await notify(["#EXTM3U", adRange(1)].join("\n"), makeWorkerInfo());
		expect(sent).toEqual(["stitched-ad-1"]);
		expect(messages.at(-1)).toMatchObject({
			key: "AdPodProgress",
			adIds: ["stitched-ad-1"],
			reportedAdIds: ["stitched-ad-1"],
		});
		(g.__TTVAB_STATE__ as Record<string, unknown>).AdPodProgressByMediaKey = {
			"live:testchannel": {
				adIds: ["stitched-ad-1"],
				reportedAdIds: ["stitched-ad-1"],
				cycleStartedAt: 5000,
			},
		};
		await notify(
			["#EXTM3U", adRange(1), adRange(2)].join("\n"),
			makeWorkerInfo(),
		);
		expect(sent).toEqual(["stitched-ad-1", "stitched-ad-2"]);
		expect(messages.at(-1)).toMatchObject({
			reportedAdIds: ["stitched-ad-2"],
		});
	});

	it("tracks and spoofs stitched ads whose ID is not the first attribute", async () => {
		const notify =
			T<
				(
					text: string,
					info: Record<string, unknown> & { SpoofedAdIds: Set<string> },
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
		const capture = captureWorkerMessages();
		const info = {
			SpoofedAdIds: new Set<string>(),
			ObservedAdPodIds: new Set<string>(),
			ExpectedAdPodLength: 0,
			VisibleAdStartedAt: 777,
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};
		const reordered = (id: number) =>
			`#EXT-X-DATERANGE:CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-POD-POSITION="${id}",X-TV-TWITCH-AD-RADS-TOKEN="rad-${id}",ID="stitched-ad-${id}",X-TV-TWITCH-AD-POD-LENGTH="2",X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"`;

		try {
			await notify(["#EXTM3U", reordered(0), reordered(1)].join("\r\n"), info);
		} finally {
			capture.restore();
		}

		expect([...info.ObservedAdPodIds]).toEqual([
			"stitched-ad-0",
			"stitched-ad-1",
		]);
		expect(capture.messages[0]).toMatchObject({
			key: "AdPodProgress",
			adIds: ["stitched-ad-0", "stitched-ad-1"],
			expectedPodLength: 2,
		});
		const impressions = batches
			.flat()
			.filter(
				(packet) =>
					packet.variables?.input?.eventName === "video_ad_impression",
			);
		expect(
			impressions.map((packet) => [
				JSON.parse(String(packet.variables?.input?.eventPayload)).ad_id,
				(packet.variables?.input as { radToken?: string } | undefined)
					?.radToken,
			]),
		).toEqual([
			["stitched-ad-0", "rad-0"],
			["stitched-ad-1", "rad-1"],
		]);
		expect([...info.SpoofedAdIds]).toEqual(["stitched-ad-0", "stitched-ad-1"]);
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

	it("reports the best known ad count when no pod length is declared", async () => {
		const notify =
			T<(text: string, info: Record<string, unknown>) => Promise<void>>(
				"_notifyAdComplete",
			);
		const log = vi.fn();
		g._log = log;
		const payloads: Array<{ total_ads?: number }> = [];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: Record<string, unknown>,
		) => {
			for (const packet of JSON.parse(
				String(options.body || "[]"),
			) as GqlPacket[]) {
				if (packet.variables?.input?.eventName === "video_ad_impression") {
					payloads.push(
						JSON.parse(String(packet.variables.input.eventPayload || "{}")),
					);
				}
			}
			return new Response(null, { status: 200 });
		};
		const info = { SpoofedAdIds: new Set<string>(), CurrentAdPod: null };
		await notify(["#EXTM3U", adRangeNoPodLength(1)].join("\n"), info);
		await notify(["#EXTM3U", adRangeNoPodLength(3)].join("\n"), info);
		expect(payloads.map((payload) => payload.total_ads)).toEqual([1, 3]);
		expect(
			log.mock.calls.some(([message]) => String(message).includes("(2/? pod)")),
		).toBe(true);
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

	it("reports the attempts actually made and keeps routine token traffic out of the console", async () => {
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
		const log = vi.fn();
		g._log = log;
		g._fetchViaWorkerBridge = async () => {
			throw new Error("fetch relay timeout");
		};
		await getToken(
			"somechannel",
			"site",
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				const err = new Error("The operation was aborted.");
				err.name = "AbortError";
				throw err;
			},
			false,
			Date.now() + 5,
		);
		const failed = log.mock.calls.find(([message]) =>
			String(message).startsWith("Token fetch failed"),
		);
		expect(String(failed?.[0])).toMatch(
			/^Token fetch failed after 1 attempt \(deadline reached\): /,
		);
		expect(log).toHaveBeenCalledWith(
			"Token relay error: fetch relay timeout",
			"warning",
		);
		expect(
			log.mock.calls.some(([message]) =>
				String(message).startsWith("Token fetch retry"),
			),
		).toBe(false);

		log.mockClear();
		g._fetchViaWorkerBridge = async () => new Response("{}", { status: 200 });
		await getToken("somechannel", "site", async () => new Response("{}"));
		expect(log).toHaveBeenCalledWith(
			"[Trace] Requesting token for site (somechannel)",
			"debug",
		);
		expect(log).toHaveBeenCalledWith("[Trace] Token response: 200", "debug");
		log.mockClear();
		g._fetchViaWorkerBridge = async () => new Response("{}", { status: 403 });
		await getToken(
			"somechannel",
			"embed",
			async () => new Response("{}"),
			true,
		);
		expect(log).toHaveBeenCalledWith(
			"[Trace] Requesting token for embed (somechannel) without viewer headers",
			"info",
		);
		expect(log).toHaveBeenCalledWith("[Trace] Token response: 403", "warning");
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

describe("ad completion pod accounting", () => {
	function captureEvents() {
		const events: Array<{ event: string; adId: string; position: unknown }> =
			[];
		g._fetchViaWorkerBridge = async (
			_url: string,
			options: { body: string },
		) => {
			for (const packet of JSON.parse(options.body) as GqlPacket[]) {
				const payload = JSON.parse(
					packet.variables?.input?.eventPayload || "{}",
				);
				events.push({
					event: String(packet.variables?.input?.eventName),
					adId: payload.ad_id,
					position: payload.ad_position,
				});
			}
			return new Response(null, { status: 200 });
		};
		return events;
	}
	const notify = () =>
		T<(text: string, info?: Record<string, unknown>) => Promise<void>>(
			"_notifyAdComplete",
		);
	const makeInfo = (extra: Record<string, unknown> = {}) => ({
		SpoofedAdIds: new Set<string>(),
		ObservedAdPodIds: new Set<string>(),
		ExpectedAdPodLength: 0,
		MaxObservedAdPodPosition: 0,
		ObservedZeroAdPodPosition: false,
		VisibleAdStartedAt: 5000,
		ChannelName: "testchannel",
		MediaKey: "live:testchannel",
		...extra,
	});
	const podCompletes = (events: Array<{ event: string; adId: string }>) =>
		events
			.filter(({ event }) => event === "video_ad_pod_complete")
			.map(({ adId }) => adId);

	it("completes a pod whose earlier ads a replaced worker reported", async () => {
		const events = captureEvents();
		await notify()(["#EXTM3U", adRange(1)].join("\n"), makeInfo());
		(g.__TTVAB_STATE__ as Record<string, unknown>).AdPodProgressByMediaKey = {
			"live:testchannel": {
				adIds: ["stitched-ad-1"],
				reportedAdIds: ["stitched-ad-1"],
				cycleStartedAt: 5000,
			},
		};
		await notify()(["#EXTM3U", adRange(1), adRange(2)].join("\n"), makeInfo());
		expect(podCompletes(events)).toEqual(["stitched-ad-2"]);
	});

	it("completes a pod that resumes after an early cycle reset", async () => {
		const events = captureEvents();
		const info = makeInfo({
			RecentSpoofedAdIds: new Map<string, number>([["stitched-ad-1", 1]]),
		});
		await notify()(["#EXTM3U", adRange(1), adRange(2)].join("\n"), info);
		expect(
			events
				.filter(({ event }) => event === "video_ad_impression")
				.map(({ adId }) => adId),
		).toEqual(["stitched-ad-2"]);
		expect(podCompletes(events)).toEqual(["stitched-ad-2"]);
	});

	it("uses the ad's index when its declared position is not a number", async () => {
		const events = captureEvents();
		await notify()(
			[
				"#EXTM3U",
				adRange(1).replace(
					'X-TV-TWITCH-AD-POD-POSITION="1"',
					'X-TV-TWITCH-AD-POD-POSITION="first"',
				),
			].join("\n"),
			makeInfo(),
		);
		expect(events[0]).toMatchObject({
			event: "video_ad_impression",
			position: 0,
		});
	});

	it("sends nothing without stream info", async () => {
		const events = captureEvents();
		await notify()(["#EXTM3U", adRange(1)].join("\n"));
		expect(events).toEqual([]);
	});
});

describe("_extractPlaybackAccessToken", () => {
	const extract = () =>
		T<(payload: unknown) => Record<string, unknown>>(
			"_extractPlaybackAccessToken",
		);

	it("finds a token and ignores unrelated objects with a value field", () => {
		expect(
			extract()({
				data: {
					streamPlaybackAccessToken: { signature: "sig", value: "token" },
				},
			}),
		).toEqual({ signature: "sig", value: "token" });
		expect(
			extract()({ data: { user: { setting: { value: "dark" } } } }),
		).toMatchObject({ hasAnySignature: false, hasAnyValue: false });
		expect(
			extract()({ data: { streamPlaybackAccessToken: { value: "token" } } }),
		).toMatchObject({ hasAnySignature: false, hasAnyValue: true });
	});
});
