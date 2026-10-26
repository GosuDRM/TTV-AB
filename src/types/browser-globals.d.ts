type PlainObject = Record<string, unknown>;
type TTVABChannelEntry = {
	ads: number;
	measuredAds: number;
	firstSeen: number;
	lastSeen: number;
	lastActive: number;
	watchSeconds: number;
	adMilliseconds: number;
};
type TTVABChannelMap = Record<string, TTVABChannelEntry>;
type TTVABChannelDeltaMap = Record<string, number>;
type TTVABDailyStatsEntry = {
	ads: number;
	measuredAds: number;
	adMilliseconds: number;
	watchSeconds: number;
};
type TTVABDailyStatsMap = Record<string, TTVABDailyStatsEntry>;
type TTVABStatsState = {
	daily: TTVABDailyStatsMap;
	channels: TTVABChannelMap;
	achievements: string[];
	adMillisecondsSaved: number;
	measuredAds: number;
};
type TTVABVisibilityGetter =
	| ((this: Document, ...args: never[]) => unknown)
	| null;
type TTVABDocumentMethod =
	| ((this: Document, ...args: never[]) => unknown)
	| null;

declare const __TTVAB_STATE__: TTVABRuntimeState;
declare var __TTVAB_LOGS__: PlainObject[] | undefined;
declare var __TTVAB_LOGS_DROPPED__: number | undefined;
declare var __TTVAB_LOG_MILESTONES__: PlainObject[] | undefined;
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

interface Element {
	_reactRootContainer?: {
		_internalRoot?: {
			current?: unknown;
		};
	};
	onclick: ((this: GlobalEventHandlers, ev: MouseEvent) => unknown) | null;
	style: CSSStyleDeclaration;
}

interface Window {
	__TTVAB_STATE__?: TTVABRuntimeState;
	ttvabVersion?: number;
	__TTVAB_M3U8_FALLBACK_ACTIVE?: boolean;
	__TTVAB_VISIBILITY_HARDENED__?: boolean;
	__TTVAB_INDEPENDENT_VIDEO_AD_GUARD__?: boolean;
	__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__?: boolean;
	__TTVAB_REQUEST_PIP_PATCHED__?: boolean;
	__TTVAB_WINDOW_OPEN_PATCHED__?: boolean;
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
	__TTVABLastPipAdMediaKey?: string | null;
	__TTVABLastPipAdCycleStartedAt?: number;
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
}
