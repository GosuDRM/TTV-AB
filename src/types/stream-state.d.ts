type TTVABVideoCodecFamily = "avc" | "hevc" | "av1";

type TTVABPlaybackContext = {
	MediaType: "live" | "vod" | null;
	MediaKey: string | null;
	ChannelName: string | null;
	VodID: string | null;
};

type TTVABStreamVariant = {
	Resolution: string;
	FrameRate: number;
	Bandwidth: number;
	Codecs: string;
	Audio: string;
	Name: string;
	Subtitles: string;
	Video: string;
	RawUrl: string;
	Url: string;
};

type TTVABBackupMaster = {
	m3u8: string;
	baseUrl: string;
	viewerHeadersOmitted: boolean;
	cycleStartedAt: number;
};

type TTVABBackupVariant = {
	playlistUrl: string | null;
	sessionUrl: string | null;
	playerType: string | null;
	resolution: string | null;
	codecFamily: TTVABVideoCodecFamily | null;
	codec: string | null;
};

type TTVABBackupPlaylistMetadata = Partial<TTVABBackupVariant> & {
	codecFamily: TTVABVideoCodecFamily | null;
	codec: string | null;
	ambiguous: boolean;
};

type TTVABBackupSelection = {
	identity: string;
	sequence: number;
	refreshedSequence: number;
};

type TTVABBackupSearchResult = {
	type: string | null;
	m3u8: string | null;
};

type TTVABBackupProbation = {
	type: string;
	at: number;
	cleanChecks: number;
	cache: TTVABBackupMaster;
	playlistUrl: string;
	codec: string | null;
	resolution: string | null;
	mediaKey: string;
	pageMediaKey: string;
	pageGeneration: number;
	cycleStartedAt: number;
	backupSearchEpoch: number;
};

type TTVABNoBackupRecoveryCandidate = {
	cache: TTVABBackupMaster;
	playlistUrl: string;
	cycleStartedAt: number;
	backupSearchEpoch: number;
	createdAt: number;
	lastProbeAt: number;
	cleanStartedAt: number;
	cleanMediaSequence: number | null;
};

type TTVABNativeMaster = {
	master: string | null;
	masterUrl: string;
	resolutionList: TTVABStreamVariant[];
};

interface TTVABRetainedNativeMaster extends TTVABNativeMaster {
	mediaKey: string;
	pageGeneration: number;
	observedAt: number;
	refreshAttemptCycleStartedAt?: number;
	refreshedAt?: number;
	refreshedCycleStartedAt?: number;
	refreshPromise?: Promise<void> | null;
}

type TTVABPendingNativeMaster = {
	master: string;
	masterUrl: string;
	playlistUrl: string;
	codec: string | null;
	resolution: string | null;
	mediaKey: string;
	cycleStartedAt: number;
	expiresAt: number;
	pageGeneration: number;
	masterServedAt: number;
	reloadAt: number;
	reloadCount: number;
	consumed: boolean;
	countedReloadAt?: number;
	loaderEpoch?: number;
	phase?: string;
	verifiedPlaylistUrls?: string[];
};

type TTVABNativeReloadConfirmation = {
	mediaKey: string;
	pageMediaKey: string | null;
	pageGeneration: number;
	cycleStartedAt: number;
	reloadAt: number;
	loaderEpoch: number;
	confirmed?: boolean;
};

type TTVABAdRollContext = {
	mediaKey: string;
	cycleStartedAt: number;
	pageGeneration: number;
	rollType: "preroll" | "midroll";
};

type TTVABEmptyAdHoldWindow = {
	cycleStartedAt: number;
	startedAt: number;
	firstSequence: number;
	discontinuity: number;
	programDateTime: number;
};

type TTVABNativeTimelineAnchor = {
	time: number;
	duration: number;
	sequence: number;
	discontinuity: number;
};

type TTVABPlaylistKind = "hold" | "backup" | "native";

type TTVABEmptyHoldTimeline = {
	kind: TTVABPlaylistKind;
	identity: string;
	generation: number;
	boundarySequence: number;
	addBoundary: boolean;
	mediaOffset: number;
	discontinuityOffset: number;
	lastSequence: number;
	lastDiscontinuity: number;
	lastRawFirstSequence: number;
	nativeAnchor?: TTVABNativeTimelineAnchor | null;
	nativeAnchors?: TTVABNativeTimelineAnchor[] | null;
};

type TTVABLivePlaylistTimeline = {
	identity: string;
	backup: boolean;
	afterHold: boolean;
	minimumTime: number;
	lastEndTime: number;
	prefetchedSegments?: { sourceUrl: string; url: string }[];
};

interface TTVABStreamInfo extends TTVABPlaybackContext {
	IsShowingAd: boolean;
	LastPlayerReload: number;
	EncodingsM3U8: string | null;
	ModifiedM3U8: string | null;
	IsUsingModifiedM3U8: boolean;
	IsUsingFallbackStream: boolean;
	IsUsingBackupStream: boolean;
	UsherBaseUrl: string;
	UsherParams: string;
	RequestedAds: Set<string>;
	SpoofedAdIds: Set<string>;
	RecentSpoofedAdIds: Map<string, number>;
	ObservedAdPodIds: Set<string>;
	ExpectedAdPodLength: number;
	MaxObservedAdPodPosition: number;
	ObservedZeroAdPodPosition: boolean;
	LastAdPodProgressAt: number;
	_IncompletePodCleanStartedAt: number;
	_IncompletePodCleanPlaylistCount: number;
	_IncompletePodLastMediaSequence: number | null;
	_IncompletePodCandidateUrl: string | null;
	MeasuredAdIds: Set<string>;
	FailedBackupPlayerTypes: Map<string, number>;
	LastSessionNeutralBackupProbeCycleStartedAt: number;
	Urls: Record<string, TTVABStreamVariant>;
	ResolutionList: TTVABStreamVariant[];
	BackupEncodingsM3U8Cache: Record<string, TTVABBackupMaster | null>;
	EnhancedVariantUrls: Set<string>;
	EnhancedDecoderCodecFamily: TTVABVideoCodecFamily | null;
	EnhancedDecoderCodec: string | null;
	ActiveBackupPlayerType: string | null;
	ActiveBackupResolution: string | null;
	SustainedNativeResolution: TTVABStreamVariant | null;
	SustainedNativeResolutionAt: number;
	SustainedNativeResolutionStartedAt: number;
	_NativePlaybackMaster: TTVABRetainedNativeMaster | null;
	LastCleanNativeM3U8: string | null;
	LastCleanNativeUrl: string | null;
	LastCleanNativeCodec: string | null;
	LastCleanNativePlaylistAt: number;
	LastCleanNativeLoaderEpoch: number;
	LastCleanBackupM3U8: string | null;
	LastCleanBackupPlayerType: string | null;
	LastCleanBackupResolution: string | null;
	LastCleanBackupCodecFamily: TTVABVideoCodecFamily | null;
	LastCleanBackupCodec: string | null;
	BackupPlaylistMetadata: Map<string, TTVABBackupPlaylistMetadata>;
	LastCleanBackupAt: number;
	IsMidroll: boolean;
	AdRollContext: TTVABAdRollContext | null;
	CsaiOnlyThisBreak: boolean;
	IsStrippingAdSegments: boolean;
	NumStrippedAdSegments: number;
	PendingAdEndAt: number;
	CleanPlaylistCount: number;
	AdEndMarkerBounceLogged: boolean;
	AdEndConfirmEscalation: number;
	VisibleAdStartedAt: number;
	IsHoldingBackupAfterAd: boolean;
	SilentBackupHoldStartedAt: number;
	LastSilentBackupHoldLogAt: number;
	LastNativeRecoveryProbeAt: number;
	BackupVariantUrls: Set<string>;
	EnhancedBackupVariantUrls: Set<string>;
	BackupVariantPlayerTypes: Map<string, string>;
	LastNativeRecoveryReadyPlayerType: string | null;
	NativeRecoveryCleanCount: number;
	NativeRecoveryProbeEpoch: number;
	_NativeRecoveryProbeInFlight: boolean;
	_NativeRecoveryProbeToken: object | null;
	NativeRecoveryProbeStreamUrl: string | null;
	NativeRecoveryProbeMediaKey: string | null;
	NativeRecoveryProbePlayerType: string | null;
	NativeRecoveryProbeCycleStartedAt: number;
	NativeRecoveryProbeLastMediaSequence: number | null;
	NativeRecoveryProbeLastAdvancedAt: number;
	NativeRecoveryAdPlaylistUrls: Set<string>;
	NativeRecoveryAdMediaKey: string | null;
	NativeRecoveryAdStartedAt: number;
	_PendingPostAdNativeMaster: TTVABPendingNativeMaster | null;
	_PendingNativeReloadConfirmation: TTVABNativeReloadConfirmation | null;
	NativeRecoveryLoaderEpoch: number;
	NativeRecoveryCandidateUrl: string | null;
	NativeRecoveryCandidateMediaKey: string | null;
	NativeRecoveryCandidateCycleStartedAt: number;
	NativeRecoveryCandidateStage: "hold" | "visible" | null;
	NativeRecoveryCandidateStartedAt: number;
	NativeRecoveryCandidateCleanCount: number;
	NativeRecoveryCandidateLastMediaSequence: number | null;
	_BackupSearchPromise: Promise<TTVABBackupSearchResult> | null;
	_BackupSearchKey: string | null;
	_BackupSearchPromises: Map<string, Promise<TTVABBackupSearchResult>>;
	_BackupSelectionSequence: number;
	_BackupSelection: TTVABBackupSelection | null;
	_LastNoBackupProbeAt: number;
	_NoBackupRecoveryCandidates: Map<string, TTVABNoBackupRecoveryCandidate>;
	_PreviewMasterFallbackRetryAt: number;
	BackupSearchEpoch: number;
	_ForegroundQualityProbeAppliedAt: number;
	ConsecutiveFailedNativeProbes: number;
	_LoggedWhitelistByType: Set<string> | null;
	_BackupSearchCount: number;
	_BackupSearchErrorCount: number;
	_BackupSearchFailCount: number;
	LastAdEndReloadAt: number;
	LastAdEndReloadKind: string | null;
	PostEscapeReloadCounterproductive: boolean;
	LastNativeRecoveryHoldLogAt: number;
	HevcReloadPendingAfterHold: boolean;
	LastAdEndBounceAt: number;
	LastActivityAt: number;
	LoggedBackupAdsByType: Set<string> | null;
	_EmptyAdHoldMediaSequence: number;
	_EmptyAdHoldDiscontinuitySequence: number;
	_EmptyAdHoldProgramDateTime: number;
	_EmptyAdHoldWindow: TTVABEmptyAdHoldWindow | null;
	_EmptyHoldTimelineByUrl: Map<string, TTVABEmptyHoldTimeline>;
	_LivePlaylistTimeline: TTVABLivePlaylistTimeline | null;
	_LastServedPlaylistKind: TTVABPlaylistKind | null;
	_FatalMediaRecoveryRequestId: string | null;
	_AdCycleRequestController: AbortController | null;
	_CodecHandoffSequence: number;
	_CodecHandoffPendingId: string | null;
	_CodecHandoffAcknowledgedId: string | null;
	_CodecHandoffFailedId: string | null;
	_CodecHandoffReloadRetryCount: number;
	_SpliceStreamId: string | null;
	_SpliceBoundarySeq: number | null;
	_SpliceDiscontinuityOffset: number;
	_SpliceLastDiscontinuitySequence: number | null;
	_SpliceLastMediaSequence: number | null;
	_NativeSpliceBoundaries: Map<string, number>;
	_PageFallbackCycleStartedAt?: number;
	_PageFallbackCleanStartedAt?: number;
	_PageFallbackCleanPlaylistCount?: number;
	_PageFallbackLastMediaSequence?: number | null;
	_BackupSearchStartedAt?: number;
	_BackupSearchStartToken?: object | null;
	_LastBackupSearchCompletedAt?: number;
	_LoggedOfflineTransition?: boolean;
	_LqHoldStartAt?: number;
	_BackupProbation?: TTVABBackupProbation | null;
	_AdRequestController?: AbortController | null;
	_BackupPinFlipCount?: number;
}

type TTVABPagePlaylistState = Partial<TTVABStreamInfo> &
	Pick<
		TTVABStreamInfo,
		| "MediaKey"
		| "MediaType"
		| "UsherBaseUrl"
		| "_EmptyAdHoldMediaSequence"
		| "_EmptyAdHoldDiscontinuitySequence"
		| "_EmptyAdHoldProgramDateTime"
		| "_EmptyAdHoldWindow"
		| "_EmptyHoldTimelineByUrl"
		| "_LivePlaylistTimeline"
		| "NumStrippedAdSegments"
		| "IsStrippingAdSegments"
	> & { PageContextGeneration: number };
