type PlainObject = Record<string, unknown>;
type TTVABChannelMap = Record<string, number>;
type TTVABDailyStatsEntry = {
	ads: number;
	domAds: number;
};
type TTVABDailyStatsMap = Record<string, TTVABDailyStatsEntry>;
type TTVABStatsState = {
	daily: TTVABDailyStatsMap;
	channels: TTVABChannelMap;
	achievements: string[];
};
type TTVABVisibilityGetter =
	| ((this: Document, ...args: never[]) => unknown)
	| null;

// biome-ignore lint/suspicious/noExplicitAny: runtime state is intentionally a dynamic bag shared across injected scripts
declare const __TTVAB_STATE__: any;
declare const TRANSLATIONS: Record<
	string,
	PlainObject & {
		achievementsMap?: Record<
			string,
			{
				name?: string;
				desc?: string;
			}
		>;
	}
>;

interface Document {
	__lookupGetter__?(property: string): TTVABVisibilityGetter | undefined;
}

interface Element {
	_reactRootContainer?: {
		_internalRoot?: {
			current?: unknown;
		};
	};
	dataset: DOMStringMap;
	onclick: ((this: GlobalEventHandlers, ev: MouseEvent) => unknown) | null;
	offsetHeight: number;
	offsetParent: Element | null;
	offsetWidth: number;
	style: CSSStyleDeclaration;
	title: string;
}

interface Window {
	[key: string]: unknown;
	ttvabVersion?: number;
	__TTVAB_NATIVE_VISIBILITY__?: {
		hidden?: TTVABVisibilityGetter;
		webkitHidden?: TTVABVisibilityGetter;
		mozHidden?: TTVABVisibilityGetter;
		visibilityState?: TTVABVisibilityGetter;
	};
	__TTVAB_REAL_FETCH__?: typeof fetch;
}

interface Worker {
	__TTVABIntentionallyTerminated?: boolean;
	__TTVABCreatedAt?: number;
	__TTVABPageMediaKey?: string | null;
}
