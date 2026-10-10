import { beforeAll } from "vitest";
import { loadModule } from "./helpers/runtime";

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
	loadModule("../dist/src/modules/constants.js", true);
	g._S = {
		workers: [],
		conflicts: [],
		reinsertPatterns: [],
		toleratedWorkerWrappers: [],
		adsBlocked: 0,
	};
	g._log = () => {};
	g.__TTVAB_STATE__ = {
		AdSignifier: "stitched",
		BackupPlayerTypes: ["embed", "popout", "autoplay"],
		AdSegmentCache: new Map<string, number>(),
		AllSegmentsAreAdSegments: false,
		IsAdStrippingEnabled: true,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		StreamInfos: Object.create(null),
		StreamInfosByUrl: Object.create(null),
		V2API: false,
		SimulatedAdsDepth: 0,
	};
	g.globalThis = g;
	g.self = g;
	g.window = g;
	g.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

	loadModule("../dist/src/modules/parser.js", true);
});

export { T } from "./helpers/runtime";
