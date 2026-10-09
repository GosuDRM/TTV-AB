type TTVABAdPodProgress = {
	adIds: string[];
	expectedPodLength: number;
	maxAdPodPosition: number;
	observedZeroAdPodPosition: boolean;
	cycleStartedAt: number;
	updatedAt: number;
};

type TTVABPlaybackState = {
	GQLDeviceID: string | null;
	AuthorizationHeader: string | null;
	ClientIntegrityHeader: string | null;
	ClientVersion: string | null;
	ClientSession: string | null;
	PlaybackAccessTokenHash: string | null;
	LastNativePlaybackAccessTokenPlayerType: string | null;
	CurrentAdChannel: string | null;
	CurrentAdMediaKey: string | null;
	AdPodProgressByMediaKey: Record<string, TTVABAdPodProgress>;
	LastAdEndedAt: number;
	LastAdEndedChannel: string | null;
	LastAdEndedMediaKey: string | null;
	LastAdEndedCycleStartedAt: number;
	PinnedBackupPlayerType: string | null;
	PinnedBackupPlayerChannel: string | null;
	PinnedBackupPlayerMediaKey: string | null;
	ActiveCodecHandoffId: string | null;
	ActiveCodecHandoffChannel: string | null;
	ActiveCodecHandoffMediaKey: string | null;
	IsAdStrippingEnabled: boolean;
	DisableAdSpoofing: boolean;
	DisableAutoplayBackup: boolean;
	PageMediaType: string | null;
	PageChannel: string | null;
	PageVodID: string | null;
	PageMediaKey: string | null;
	PagePlaybackContextGeneration: number;
	AllowPreviewEmergencyAutoplayBackup: boolean;
	PagePlaybackVisibleSinceAt: number;
	PreferredQualityGroup: string | null;
	PlayerHasPlayedOnce: boolean;
	PlayerIsPlaying: boolean;
	HasTriggeredPlayerReload: boolean;
	PendingTriggeredPlayerReloadChannel: string | null;
	PendingTriggeredPlayerReloadMediaKey: string | null;
	PendingTriggeredPlayerReloadAt: number;
	PendingTriggeredPlayerReloadCycleStartedAt: number;
};

type TTVABStreamInfo = ReturnType<typeof _createStreamInfo> & PlainObject;

type TTVABSegmentCodecOwner = {
	codecFamily: "avc" | "hevc" | "av1" | null;
	mediaKey: string | null;
	recordedAt: number;
	ambiguous: boolean;
};

type TTVABPendingFetchRequest = {
	resolve: (response: TTVABFetchResponse) => void;
	reject: (error: unknown) => void;
};

interface TTVABRuntimeState extends TTVABPlaybackState {
	AdSignifier: string;
	BackupPlayerTypes: string[];
	FallbackPlayerType: string;
	ForceAccessTokenPlayerType: string | null;
	RewriteNativePlaybackAccessToken: boolean;
	PlayerBufferingDoPlayerReload: boolean;
	PlayerReloadMinimalRequestsTime: number;
	PlayerReloadMinimalRequestsPlayerIndex: number;
	PlayerReloadDebounceMs: number;
	AdCycleStaleMs: number;
	AdEndGraceMs: number;
	AdEndMaxWaitMs: number;
	AdEndBackupHoldMaxMs: number;
	AdEndBounceDebounceMs: number;
	SilentBackupHoldMaxMs: number;
	AdEndMinCleanPlaylists: number;
	AdEndMinNativeRecoveryProbes: number;
	AdEndNativeRecoveryProbeCooldownMs: number;
	AdEndMaxFailedNativeProbes: number;
	AdRecoveryReloadCooldownMs: number;
	PinnedBackupStallDetectionMs: number;
	PinnedBackupStallPollMs: number;
	BackupSearchForceRefreshAt: number;
	LastPinnedBackupStallDetectedAt: number;
	LqHqHoldMinMs: number;
	LastPlayerReloadAt: number;
	LastPlayerReloadAtByMediaKey: Record<string, number>;
	LastAdDetectedAt: number;
	LastAdRecoveryReloadAt: number;
	LastAdRecoveryResumeAt: number;
	ShouldResumeAfterAd: boolean;
	ShouldResumeAfterAdChannel: string | null;
	ShouldResumeAfterAdMediaKey: string | null;
	ShouldResumeAfterAdUntil: number;
	StreamInfos: Record<string, TTVABStreamInfo>;
	StreamInfosByUrl: Record<string, TTVABStreamInfo>;
	SimulatedAdsDepth: number;
	V2API: boolean;
	IsBufferFixEnabled: boolean;
	AdSegmentCache: Map<string, number>;
	SegmentCodecOwners: Map<string, TTVABSegmentCodecOwner>;
	PlayerBufferingDelay: number;
	PlayerBufferingSameStateCount: number;
	PlayerBufferingDangerZone: number;
	PlayerBufferingMinRepeatDelay: number;
	PlayerBufferingPrerollCheckEnabled: boolean;
	PlayerBufferingPrerollCheckOffset: number;
	AllSegmentsAreAdSegments: boolean;
	PagePlaybackRouteKey: string | null;
	HasResolvedAdsCountState: boolean;
	PendingInitialAdsBlockedDelta: number;
	PendingFetchRequests: Map<string, TTVABPendingFetchRequest>;
	FetchRequestSeq: number;
	_AdRecoveryConsecutiveFailures: number;
	LoggedAdSpoofNoMatch: boolean;
	LoggedAdSpoofNoToken: boolean;
	LoggedAdSpoofBadStatus: boolean;
	RequestMediaBootstrapRecovery?: (
		context: TTVABPlaybackContextInput,
		cycleStartedAt: number,
	) => boolean;
	PrepareFatalMediaRecovery?: (
		request: TTVABWorkerCommandPayloads["PrepareFatalMediaRecovery"],
	) => Promise<boolean>;
}
