import { beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	g._C = {
		VERSION: "7.0.0", INTERNAL_VERSION: 108, AD_SIGNIFIER: "stitched",
		CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
		PLAYER_TYPES: ["embed", "popout", "autoplay"],
		FALLBACK_TYPE: "embed", FORCE_TYPE: "popout", RELOAD_TIME: 1500,
		PLAYER_RELOAD_DEBOUNCE_MS: 1500, AD_CYCLE_STALE_MS: 30000,
		AD_END_GRACE_MS: 500, AD_END_MAX_WAIT_MS: 4000,
		AD_END_BACKUP_HOLD_MAX_MS: 90000, AD_END_MIN_CLEAN_PLAYLISTS: 3,
		AD_END_MIN_NATIVE_RECOVERY_PROBES: 3,
		AD_END_NATIVE_RECOVERY_PROBE_COOLDOWN_MS: 500,
		AD_RECOVERY_RELOAD_COOLDOWN_MS: 15000, BUFFERING_FIX: true,
		RELOAD_AFTER_AD: true, REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN: false,
		PLAYER_BUFFERING_DO_PLAYER_RELOAD: false,
		ALWAYS_RELOAD_PLAYER_ON_AD: false,
		LOG_STYLES: { prefix: "", info: "", success: "", warning: "", error: "" },
	};
	g._S = { workers: [], conflicts: [], reinsertPatterns: [], adsBlocked: 0 };
	g._log = () => {};
	g.__TTVAB_STATE__ = {
		AdSignifier: "stitched", BackupPlayerTypes: ["embed", "popout", "autoplay"],
		AdSegmentCache: new Set<string>(), AllSegmentsAreAdSegments: false,
		IsAdStrippingEnabled: true, CurrentAdChannel: null, CurrentAdMediaKey: null,
		StreamInfos: Object.create(null), StreamInfosByUrl: Object.create(null),
		V2API: false,
	};
	g.globalThis = g;
	g.self = g;
	g.window = g;
	g.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

	const js = readFileSync(
		resolve(__dirname, "../dist/src/modules/parser.js"), "utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^function (_\w+)/gm, "globalThis.$1 = function");
	new Function("globalThis", js)(globalThis);
});

export function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}
