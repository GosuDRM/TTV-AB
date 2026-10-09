type PlainObject = Record<string, unknown>;
type TTVABChannelEntry = {
	ads: number;
	firstSeen: number;
	lastSeen: number;
	watchSeconds: number;
	adMilliseconds: number;
};
type TTVABChannelMap = Record<string, TTVABChannelEntry>;
type TTVABChannelDeltaMap = Record<string, number>;
type TTVABDailyStatsEntry = {
	ads: number;
};
type TTVABDailyStatsMap = Record<string, TTVABDailyStatsEntry>;
type TTVABStatsState = {
	daily: TTVABDailyStatsMap;
	channels: TTVABChannelMap;
	achievements: string[];
	adMillisecondsSaved: number;
};
type TTVABVisibilityGetter =
	| ((this: Document, ...args: never[]) => unknown)
	| null;
type TTVABDocumentMethod =
	| ((this: Document, ...args: never[]) => unknown)
	| null;

declare const __TTVAB_STATE__: TTVABRuntimeState;
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
	__TTVAB_STATE__?: TTVABRuntimeState;
	[key: string]: unknown;
	ttvabVersion?: number;
	__TTVAB_NATIVE_VISIBILITY__?: {
		hidden?: TTVABVisibilityGetter;
		webkitHidden?: TTVABVisibilityGetter;
		mozHidden?: TTVABVisibilityGetter;
		visibilityState?: TTVABVisibilityGetter;
		hasFocus?: TTVABDocumentMethod;
	};
	__TTVAB_REAL_FETCH__?: typeof fetch;
}

interface Worker {
	__TTVABIntentionallyTerminated?: boolean;
	__TTVABCrashed?: boolean;
	__TTVABCrashedAt?: number;
	__TTVABCreatedAt?: number;
	__TTVABLastPongAt?: number;
	__TTVABFirstPongAt?: number;
	__TTVABInitialHeartbeatTimer?: ReturnType<typeof setTimeout> | null;
	__TTVABGeneration?: number;
	__TTVABPlaybackBootstrapObservedAtByMediaKey?: Map<string, number>;
	__TTVABPlaybackPageContext?: {
		pageMediaKey: string;
		pageContextGeneration: number;
		mediaKey: string;
	} | null;
	__TTVABPlaybackObservedAtByMediaKey?: Map<string, number>;
	__TTVABRecoveryEpoch?: number;
	__TTVABTerminatedAt?: number;
	__TTVABTerminationRecoveryTimer?: ReturnType<typeof setTimeout> | null;
	__TTVABRestartAttempts?: number;
	__TTVABMissedPongs?: number;
	__TTVABLastPingSentAt?: number;
	__TTVABHiddenHeartbeatMediaTime?: number;
	__TTVABHiddenHeartbeatMediaRef?: WeakRef<HTMLMediaElement> | null;
	__TTVABHiddenHeartbeatMissingSamples?: number;
	__TTVABPageMediaType?: string | null;
	__TTVABPageChannel?: string | null;
	__TTVABPageVodID?: string | null;
	__TTVABPageMediaKey?: string | null;
	__TTVABFetchControllers?: Map<string, AbortController>;
	__TTVABWorkerUrl?: string;
	__TTVABWorkerOpts?: unknown;
}
