import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;

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
});

afterEach(() => {
	delete g._fetchViaWorkerBridge;
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function adRange(id: number) {
	return `#EXT-X-DATERANGE:ID="stitched-ad-${id}",CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-RADS-TOKEN="rad-${id}",X-TV-TWITCH-AD-POD-LENGTH="2",X-TV-TWITCH-AD-POD-POSITION="${id}",X-TV-TWITCH-AD-DURATION="15.000",X-TV-TWITCH-AD-ROLL-TYPE="PREROLL"`;
}

describe("_notifyAdComplete", () => {
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
});
