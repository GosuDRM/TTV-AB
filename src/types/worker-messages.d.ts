type TTVABPlaybackContextInput = {
	MediaType?: string | null;
	mediaType?: string | null;
	ChannelName?: string | null;
	channelName?: string | null;
	login?: string | null;
	VodID?: string | number | null;
	vodID?: string | number | null;
	videoID?: string | number | null;
	MediaKey?: string | null;
	mediaKey?: string | null;
};

type TTVABReloadContext = TTVABPlaybackContextInput & {
	reason?: string | null;
	handoffId?: string | null;
	cycleStartedAt?: number;
	reloadAt?: number;
	preserveNativeSession?: boolean;
};

type TTVABFetchResponse = {
	id: string;
	status?: number;
	statusText?: string | null;
	ok?: boolean;
	redirected?: boolean;
	type?: string | null;
	url?: string | null;
	headers?: Record<string, string>;
	body?: string | null;
	error?: string | null;
};

type TTVABWorkerCommandPayloads = {
	UpdateClientVersion: TTVABPlaybackState["ClientVersion"];
	UpdateClientSession: TTVABPlaybackState["ClientSession"];
	UpdateDeviceId: TTVABPlaybackState["GQLDeviceID"];
	UpdateClientIntegrityHeader: TTVABPlaybackState["ClientIntegrityHeader"];
	UpdateAuthorizationHeader: TTVABPlaybackState["AuthorizationHeader"];
	UpdateToggleState: boolean;
	UpdateAdSpoofingState: boolean;
	UpdateAutoplayBackupState: boolean;
	UpdateAdsBlocked: number;
	UpdateGQLHash: TTVABPlaybackState["PlaybackAccessTokenHash"];
	UpdateLastNativePlaybackAccessTokenPlayerType: TTVABPlaybackState["LastNativePlaybackAccessTokenPlayerType"];
	UpdatePlayerHasPlayedOnce: boolean;
	UpdatePlayerIsPlaying: boolean;
	Ping: null;
	UpdatePageContext: TTVABPlaybackContextInput & {
		preservedMediaKey?: string | null;
		playbackContextGeneration?: number;
		allowPreviewEmergencyAutoplayBackup?: boolean;
	};
	UpdatePreferredQualityGroup: TTVABPlaybackState["PreferredQualityGroup"];
	UpdatePagePlaybackVisibleSinceAt: number;
	UpdateCurrentAdContext: TTVABPlaybackContextInput | null;
	UpdateLastAdEndContext: TTVABPlaybackContextInput & {
		endedAt?: number;
		cycleStartedAt?: number;
	};
	UpdateAdPodProgress: TTVABPlaybackContextInput & Partial<TTVABAdPodProgress>;
	ClearAdPodProgress: {
		mediaKey: string;
		beforeCycleStartedAt?: number;
	};
	ResetAdCycleState: TTVABPlaybackContextInput & {
		cycleStartedAt?: number;
	};
	UpdatePinnedBackupPlayerContext:
		| (TTVABPlaybackContextInput & {
				type?: string | null;
				cycleStartedAt?: number;
		  })
		| null;
	PrepareFatalMediaRecovery: TTVABPlaybackContextInput & {
		recoveryId: string;
		recoveryKind?: string | null;
		requestedAt?: number;
		cycleStartedAt?: number;
	};
	UpdateCodecHandoffContext: TTVABReloadContext & {
		clearHandoffId?: string | null;
	};
	CodecHandoffReloadFailed: TTVABPlaybackContextInput & {
		handoffId: string;
		cycleStartedAt?: number;
	};
	UpdateBackupSearchForceRefresh: number;
	ResetPlaybackRecoveryState: {
		clearAdContext?: boolean;
		previousMediaKey?: string | null;
		preservedMediaKey?: string | null;
	};
	ReleasePlaybackContext: TTVABPlaybackContextInput;
	FetchResponse: TTVABFetchResponse;
	PreparePostAdNativeReload: TTVABReloadContext;
	ReleasePostAdNativeSession: {
		mediaKey: string;
		cycleStartedAt: number;
		reloadAt: number;
	};
	TriggeredPlayerReload: TTVABReloadContext | null;
};

type TTVABWorkerCommand = {
	[Key in keyof TTVABWorkerCommandPayloads]: {
		key: Key;
		targetMediaKey?: string | null;
	} & (Key extends "Ping"
		? { value?: null }
		: { value: TTVABWorkerCommandPayloads[Key] });
}[keyof TTVABWorkerCommandPayloads];

type TTVABWorkerBridgeMessage = PlainObject & {
	key: string;
	channel?: string | null;
	mediaKey?: string | null;
	handoffId?: string | null;
};

type TTVABWorkerEventContext = {
	mediaType?: string | null;
	channel?: string | null;
	vodID?: string | number | null;
	mediaKey?: string | null;
	pageChannel?: string | null;
	pageMediaKey?: string | null;
	pageContextGeneration?: number;
	cycleStartedAt?: number;
	handoffId?: string | null;
};

type TTVABWorkerFetchOptions = Pick<
	RequestInit,
	| "method"
	| "cache"
	| "credentials"
	| "mode"
	| "redirect"
	| "referrer"
	| "referrerPolicy"
	| "integrity"
	| "keepalive"
	| "priority"
> & {
	body?: string | null;
	headers?: Record<string, string> | [string, string][];
};

type TTVABWorkerEventPayloads = {
	Pong: { value?: null };
	CancelFetchRequest: { value: { id: string } };
	FetchRequest: {
		value: {
			id: string;
			url: string;
			options?: TTVABWorkerFetchOptions | null;
		};
	};
	WorkerErrorDiagnostic: {
		value: {
			message?: string;
			filename?: string;
			lineno?: number;
			colno?: number;
			stack?: string;
		};
	};
	PlaybackWorkerObserved: {
		playlistUrl?: string | null;
		codec?: string | null;
		decoderCodec?: string | null;
	};
	PlaybackWorkerBootstrapObserved: Record<never, never>;
	MediaBootstrapRecoveryNeeded: Record<never, never>;
	VodAdRequestBlocked: { sessionID?: string | null };
	PreviewMasterRecoveryFailed: {
		reason?: string | null;
		reportedAt?: number;
		status?: number;
	};
	LogEntry: { value: { t?: number; l?: string; m?: string } };
	AdBlocked: { count?: number; delta?: number };
	AdSecondsBlocked: {
		measurements?: {
			id: string;
			durationMilliseconds: number;
			startDateMilliseconds?: number;
		}[];
		seconds?: number;
	};
	AdPodProgress: Partial<TTVABAdPodProgress>;
	AdDetected: {
		continued?: boolean;
		detectedAt?: number;
		playlistUrl?: string | null;
		codec?: string | null;
	};
	AdEnded: { endedAt?: number; holdingBackup?: boolean; willReload?: boolean };
	BackupPlayerTypeSelected: { value: string | null };
	FatalMediaRecoveryReady: {
		recoveryId: string;
		verifiedAt?: number;
		requiresCodecHandoff?: boolean;
		backupPlayerType?: string | null;
	};
	PostAdNativeReloadReady: {
		reloadAt?: number;
		confirmedAt?: number;
		loaderEpoch?: number;
	};
	PostAdNativeSession: {
		pageGeneration?: number;
		phase?: string | null;
		codec?: string | null;
		resolution?: string | null;
		reloadAt?: number;
		expiresAt?: number;
	};
	NativePlaybackRestored: {
		restoredAt?: number;
		fromSilentBackupHold?: boolean;
		requiresReload?: boolean;
		continuePlayback?: boolean;
		refreshAccessToken?: boolean;
	};
	PauseResumePlayer: Record<never, never>;
	ReloadPlayer: {
		reason?: string | null;
		refreshAccessToken?: boolean;
		newMediaPlayerInstance?: boolean;
	};
};

type TTVABWorkerEvent = {
	[Key in keyof TTVABWorkerEventPayloads]: {
		key: Key;
	} & TTVABWorkerEventContext &
		TTVABWorkerEventPayloads[Key];
}[keyof TTVABWorkerEventPayloads];

type TTVABReceivedWorkerEvent = {
	[Key in keyof TTVABWorkerEventPayloads]: {
		key: Key;
	} & TTVABWorkerEventContext &
		(Key extends "LogEntry" | "WorkerErrorDiagnostic"
			? {
					value: {
						[Field in keyof TTVABWorkerEventPayloads[Key]["value"]]?: unknown;
					};
				}
			: Key extends "AdSecondsBlocked"
				? { measurements?: unknown[]; seconds?: number }
				: TTVABWorkerEventPayloads[Key]);
}[keyof TTVABWorkerEventPayloads];
