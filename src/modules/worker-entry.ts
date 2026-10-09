function _isWorkerCommand(message: PlainObject): message is TTVABWorkerCommand {
	if (
		message.targetMediaKey != null &&
		typeof message.targetMediaKey !== "string"
	)
		return false;
	const value = message.value;
	switch (message.key) {
		case "UpdateClientVersion":
		case "UpdateClientSession":
		case "UpdateDeviceId":
		case "UpdateClientIntegrityHeader":
		case "UpdateAuthorizationHeader":
		case "UpdateGQLHash":
		case "UpdateLastNativePlaybackAccessTokenPlayerType":
		case "UpdatePreferredQualityGroup":
			return value === null || typeof value === "string";
		case "UpdateToggleState":
		case "UpdateAdSpoofingState":
		case "UpdateAutoplayBackupState":
		case "UpdatePlayerHasPlayedOnce":
		case "UpdatePlayerIsPlaying":
			return typeof value === "boolean";
		case "UpdateAdsBlocked":
		case "UpdatePagePlaybackVisibleSinceAt":
		case "UpdateBackupSearchForceRefresh":
			return typeof value === "number" && Number.isFinite(value);
		case "Ping":
			return value == null;
		case "UpdatePageContext":
			return _hasWorkerMessageFields(value, {
				preservedMediaKey: "string",
				playbackContextGeneration: "number",
				allowPreviewEmergencyAutoplayBackup: "boolean",
			});
		case "UpdateCurrentAdContext":
			return value === null || _hasWorkerMessageFields(value);
		case "ReleasePlaybackContext":
			return _hasWorkerMessageFields(value);
		case "UpdateLastAdEndContext":
			return _hasWorkerMessageFields(value, {
				endedAt: "number",
				cycleStartedAt: "number",
			});
		case "UpdateAdPodProgress":
			return (
				_hasWorkerMessageFields(value, {
					expectedPodLength: "number",
					maxAdPodPosition: "number",
					observedZeroAdPodPosition: "boolean",
					cycleStartedAt: "number",
					updatedAt: "number",
				}) &&
				(value.adIds === undefined ||
					(Array.isArray(value.adIds) &&
						value.adIds.every((id) => typeof id === "string")))
			);
		case "ClearAdPodProgress":
			return (
				_hasWorkerMessageFields(value, { beforeCycleStartedAt: "number" }) &&
				typeof value.mediaKey === "string"
			);
		case "ResetAdCycleState":
			return _hasWorkerMessageFields(value, { cycleStartedAt: "number" });
		case "UpdatePinnedBackupPlayerContext":
			return (
				value === null ||
				_hasWorkerMessageFields(value, {
					type: "string",
					cycleStartedAt: "number",
				})
			);
		case "PrepareFatalMediaRecovery":
			return (
				_hasWorkerMessageFields(value, {
					recoveryId: "string",
					recoveryKind: "string",
					requestedAt: "number",
					cycleStartedAt: "number",
				}) && typeof value.recoveryId === "string"
			);
		case "UpdateCodecHandoffContext":
		case "PreparePostAdNativeReload":
		case "TriggeredPlayerReload":
			return (
				(message.key === "TriggeredPlayerReload" && value === null) ||
				_hasWorkerMessageFields(value, {
					reason: "string",
					handoffId: "string",
					clearHandoffId: "string",
					cycleStartedAt: "number",
					reloadAt: "number",
					preserveNativeSession: "boolean",
				})
			);
		case "CodecHandoffReloadFailed":
			return (
				_hasWorkerMessageFields(value, {
					handoffId: "string",
					cycleStartedAt: "number",
				}) && typeof value.handoffId === "string"
			);
		case "ResetPlaybackRecoveryState":
			return _hasWorkerMessageFields(value, {
				clearAdContext: "boolean",
				previousMediaKey: "string",
				preservedMediaKey: "string",
			});
		case "FetchResponse":
			return (
				_hasWorkerMessageFields(value, {
					id: "string",
					status: "number",
					statusText: "string",
					ok: "boolean",
					redirected: "boolean",
					type: "string",
					url: "string",
					body: "string",
					error: "string",
				}) &&
				typeof value.id === "string" &&
				(value.headers === undefined ||
					(value.headers !== null &&
						typeof value.headers === "object" &&
						!Array.isArray(value.headers) &&
						Object.values(value.headers).every(
							(entry) => typeof entry === "string",
						)))
			);
		case "ReleasePostAdNativeSession":
			return (
				_hasWorkerMessageFields(value, {
					cycleStartedAt: "number",
					reloadAt: "number",
				}) &&
				typeof value.mediaKey === "string" &&
				typeof value.cycleStartedAt === "number" &&
				typeof value.reloadAt === "number"
			);
		default:
			return false;
	}
}

function _getWorkerCommand(value: unknown): TTVABWorkerCommand | null {
	const message = _getWorkerBridgeMessage(value);
	return message && _isWorkerCommand(message) ? message : null;
}

function _startPlaybackWorker(seed: TTVABWorkerSeed) {
	_declareState(self);
	__TTVAB_STATE__.GQLDeviceID = seed.state.GQLDeviceID;
	__TTVAB_STATE__.AuthorizationHeader = seed.state.AuthorizationHeader;
	__TTVAB_STATE__.ClientIntegrityHeader = seed.state.ClientIntegrityHeader;
	__TTVAB_STATE__.ClientVersion = seed.state.ClientVersion;
	__TTVAB_STATE__.ClientSession = seed.state.ClientSession;
	__TTVAB_STATE__.PlaybackAccessTokenHash = seed.state.PlaybackAccessTokenHash;
	__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType =
		seed.state.LastNativePlaybackAccessTokenPlayerType;
	__TTVAB_STATE__.CurrentAdChannel = seed.state.CurrentAdChannel;
	__TTVAB_STATE__.CurrentAdMediaKey = seed.state.CurrentAdMediaKey;
	__TTVAB_STATE__.AdPodProgressByMediaKey = seed.state.AdPodProgressByMediaKey;
	__TTVAB_STATE__.LastAdEndedAt = seed.state.LastAdEndedAt;
	__TTVAB_STATE__.LastAdEndedChannel = seed.state.LastAdEndedChannel;
	__TTVAB_STATE__.LastAdEndedMediaKey = seed.state.LastAdEndedMediaKey;
	__TTVAB_STATE__.LastAdEndedCycleStartedAt =
		seed.state.LastAdEndedCycleStartedAt;
	__TTVAB_STATE__.PinnedBackupPlayerType = seed.state.PinnedBackupPlayerType;
	__TTVAB_STATE__.PinnedBackupPlayerChannel =
		seed.state.PinnedBackupPlayerChannel;
	__TTVAB_STATE__.PinnedBackupPlayerMediaKey =
		seed.state.PinnedBackupPlayerMediaKey;
	__TTVAB_STATE__.ActiveCodecHandoffId = seed.state.ActiveCodecHandoffId;
	__TTVAB_STATE__.ActiveCodecHandoffChannel =
		seed.state.ActiveCodecHandoffChannel;
	__TTVAB_STATE__.ActiveCodecHandoffMediaKey =
		seed.state.ActiveCodecHandoffMediaKey;
	__TTVAB_STATE__.IsAdStrippingEnabled = seed.state.IsAdStrippingEnabled;
	__TTVAB_STATE__.DisableAdSpoofing = seed.state.DisableAdSpoofing;
	__TTVAB_STATE__.DisableAutoplayBackup = seed.state.DisableAutoplayBackup;
	__TTVAB_STATE__.PageMediaType = seed.state.PageMediaType;
	__TTVAB_STATE__.PageChannel = seed.state.PageChannel;
	__TTVAB_STATE__.PageVodID = seed.state.PageVodID;
	__TTVAB_STATE__.PageMediaKey = seed.state.PageMediaKey;
	__TTVAB_STATE__.PagePlaybackContextGeneration =
		seed.state.PagePlaybackContextGeneration;
	__TTVAB_STATE__.AllowPreviewEmergencyAutoplayBackup =
		seed.state.AllowPreviewEmergencyAutoplayBackup;
	__TTVAB_STATE__.PagePlaybackVisibleSinceAt =
		seed.state.PagePlaybackVisibleSinceAt;
	__TTVAB_STATE__.PreferredQualityGroup = seed.state.PreferredQualityGroup;
	__TTVAB_STATE__.PlayerHasPlayedOnce = seed.state.PlayerHasPlayedOnce;
	__TTVAB_STATE__.PlayerIsPlaying = seed.state.PlayerIsPlaying;
	__TTVAB_STATE__.HasTriggeredPlayerReload =
		seed.state.HasTriggeredPlayerReload;
	__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel =
		seed.state.PendingTriggeredPlayerReloadChannel;
	__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey =
		seed.state.PendingTriggeredPlayerReloadMediaKey;
	__TTVAB_STATE__.PendingTriggeredPlayerReloadAt =
		seed.state.PendingTriggeredPlayerReloadAt;
	__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt =
		seed.state.PendingTriggeredPlayerReloadCycleStartedAt;

	self.addEventListener("message", (e: MessageEvent<unknown>) => {
		const data = _getWorkerCommand(e.data);
		if (!data) return;

		e.stopImmediatePropagation?.();
		switch (data.key) {
			case "UpdateClientVersion":
				__TTVAB_STATE__.ClientVersion = data.value;
				break;
			case "UpdateClientSession":
				__TTVAB_STATE__.ClientSession = data.value;
				break;
			case "UpdateDeviceId":
				__TTVAB_STATE__.GQLDeviceID = data.value;
				break;
			case "UpdateClientIntegrityHeader":
				__TTVAB_STATE__.ClientIntegrityHeader = data.value;
				break;
			case "UpdateAuthorizationHeader":
				__TTVAB_STATE__.AuthorizationHeader = data.value;
				break;
			case "UpdateToggleState":
				{
					const enabled = data.value === true;
					if (!enabled) {
						for (const streamInfo of Object.values(
							__TTVAB_STATE__.StreamInfos,
						)) {
							_resetStreamAdState(streamInfo);
						}
						__TTVAB_STATE__.CurrentAdChannel = null;
						__TTVAB_STATE__.CurrentAdMediaKey = null;
						__TTVAB_STATE__.PinnedBackupPlayerType = null;
						__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
						__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
						__TTVAB_STATE__.ActiveCodecHandoffId = null;
						__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
						__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
						__TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null);
						__TTVAB_STATE__.LastAdEndedAt = 0;
						__TTVAB_STATE__.LastAdEndedChannel = null;
						__TTVAB_STATE__.LastAdEndedMediaKey = null;
						__TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
						__TTVAB_STATE__.HasTriggeredPlayerReload = false;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
					}
					__TTVAB_STATE__.IsAdStrippingEnabled = enabled;
				}
				break;
			case "UpdateAdSpoofingState":
				__TTVAB_STATE__.DisableAdSpoofing = data.value === true;
				break;
			case "UpdateAutoplayBackupState":
				{
					const shouldDisableAutoplayBackup = data.value === true;
					if (
						__TTVAB_STATE__.DisableAutoplayBackup ===
						shouldDisableAutoplayBackup
					) {
						break;
					}
					__TTVAB_STATE__.DisableAutoplayBackup = shouldDisableAutoplayBackup;
					for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
						streamInfo._LastBackupSearchCompletedAt = 0;
					}
				}
				break;
			case "UpdateAdsBlocked":
				_S.adsBlocked = data.value;
				break;
			case "UpdateGQLHash":
				__TTVAB_STATE__.PlaybackAccessTokenHash = data.value;
				break;
			case "UpdateLastNativePlaybackAccessTokenPlayerType":
				__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = data.value;
				break;
			case "UpdatePlayerHasPlayedOnce":
				__TTVAB_STATE__.PlayerHasPlayedOnce = data.value === true;
				break;
			case "UpdatePlayerIsPlaying":
				__TTVAB_STATE__.PlayerIsPlaying = data.value === true;
				break;
			case "Ping":
				_postWorkerBridgeMessage(self, { key: "Pong", value: null });
				break;
			case "UpdatePageContext":
				{
					const nextPageContext = _normalizePlaybackContext(data.value);
					const preservedMediaKey = _normalizeMediaKey(
						data.value?.preservedMediaKey,
					);
					if (
						!preservedMediaKey ||
						__TTVAB_STATE__.PageMediaKey !== preservedMediaKey
					) {
						__TTVAB_STATE__.PageMediaType = nextPageContext.MediaType;
						__TTVAB_STATE__.PageChannel = nextPageContext.ChannelName;
						__TTVAB_STATE__.PageVodID = nextPageContext.VodID;
						__TTVAB_STATE__.PageMediaKey = nextPageContext.MediaKey;
						__TTVAB_STATE__.PagePlaybackContextGeneration = Math.max(
							0,
							Number(data.value?.playbackContextGeneration) || 0,
						);
						if (
							typeof data.value?.allowPreviewEmergencyAutoplayBackup ===
							"boolean"
						) {
							__TTVAB_STATE__.AllowPreviewEmergencyAutoplayBackup =
								data.value.allowPreviewEmergencyAutoplayBackup;
						}
						const pendingReloadMediaKey = _normalizeMediaKey(
							__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
						);
						const pendingReloadChannel = _normalizeChannelName(
							__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel,
						);
						if (
							(pendingReloadMediaKey &&
								pendingReloadMediaKey !== nextPageContext.MediaKey) ||
							(!pendingReloadMediaKey &&
								pendingReloadChannel &&
								pendingReloadChannel !== nextPageContext.ChannelName)
						) {
							__TTVAB_STATE__.HasTriggeredPlayerReload = false;
							__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
							__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
							__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
							__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
						}
					}
				}
				break;
			case "UpdatePreferredQualityGroup":
				__TTVAB_STATE__.PreferredQualityGroup = data.value || null;
				break;
			case "UpdatePagePlaybackVisibleSinceAt":
				__TTVAB_STATE__.PagePlaybackVisibleSinceAt = Math.max(
					0,
					Number(data.value) || 0,
				);
				break;
			case "UpdateCurrentAdContext":
				{
					const nextAdContext = _normalizePlaybackContext(data.value);
					if (
						__TTVAB_STATE__.IsAdStrippingEnabled !== true &&
						nextAdContext.MediaKey
					) {
						break;
					}
					__TTVAB_STATE__.CurrentAdChannel = nextAdContext.ChannelName;
					__TTVAB_STATE__.CurrentAdMediaKey = nextAdContext.MediaKey;
				}
				break;
			case "UpdateLastAdEndContext":
				{
					const lastEndContext = _normalizePlaybackContext(data.value);
					if (
						__TTVAB_STATE__.IsAdStrippingEnabled !== true &&
						(lastEndContext.MediaKey || Number(data.value?.endedAt) > 0)
					) {
						break;
					}
					__TTVAB_STATE__.LastAdEndedAt = Math.max(
						0,
						Number(data.value?.endedAt) || 0,
					);
					__TTVAB_STATE__.LastAdEndedChannel = lastEndContext.ChannelName;
					__TTVAB_STATE__.LastAdEndedMediaKey = lastEndContext.MediaKey;
					__TTVAB_STATE__.LastAdEndedCycleStartedAt = Math.max(
						0,
						Number(data.value?.cycleStartedAt) || 0,
					);
				}
				break;
			case "UpdateAdPodProgress":
				{
					if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
						break;
					}
					const progressContext = _normalizePlaybackContext(data.value);
					const progressInfo =
						(progressContext.MediaKey &&
							__TTVAB_STATE__.StreamInfos[progressContext.MediaKey]) ||
						null;
					if (progressInfo) {
						_applyAdPodProgressToInfo(progressInfo, data.value);
					} else {
						_mergeAdPodProgress(data.value);
					}
				}
				break;
			case "ClearAdPodProgress":
				_clearAdPodProgress(
					data.value?.mediaKey,
					data.value?.beforeCycleStartedAt,
				);
				break;
			case "ResetAdCycleState":
				_resetWorkerAdCycleState(data.value);
				break;
			case "UpdatePinnedBackupPlayerContext":
				{
					const nextPinnedContext = _normalizePlaybackContext(data.value);
					const nextPinnedType = data.value?.type || null;
					if (
						__TTVAB_STATE__.IsAdStrippingEnabled !== true &&
						(nextPinnedType || nextPinnedContext.MediaKey)
					) {
						break;
					}
					const nextPinnedCycleStartedAt = Math.max(
						0,
						Number(data.value?.cycleStartedAt) || 0,
					);
					const nextPinnedInfo =
						(nextPinnedContext.MediaKey &&
							__TTVAB_STATE__.StreamInfos[nextPinnedContext.MediaKey]) ||
						null;
					if (
						nextPinnedType &&
						(!nextPinnedInfo ||
							!_isCodecHandoffCycleCurrent(
								nextPinnedContext.MediaKey,
								nextPinnedCycleStartedAt,
								nextPinnedInfo,
							))
					) {
						break;
					}
					__TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
					__TTVAB_STATE__.PinnedBackupPlayerChannel =
						nextPinnedContext.ChannelName;
					__TTVAB_STATE__.PinnedBackupPlayerMediaKey =
						nextPinnedContext.MediaKey;
				}
				break;
			case "PrepareFatalMediaRecovery":
				if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
					break;
				}
				if (typeof __TTVAB_STATE__.PrepareFatalMediaRecovery === "function") {
					void __TTVAB_STATE__.PrepareFatalMediaRecovery(data.value);
				}
				break;
			case "UpdateCodecHandoffContext":
				{
					const nextCodecHandoffContext = _normalizePlaybackContext(data.value);
					const nextHandoffId =
						typeof data.value?.handoffId === "string" && data.value.handoffId
							? data.value.handoffId
							: null;
					if (__TTVAB_STATE__.IsAdStrippingEnabled !== true && nextHandoffId) {
						break;
					}
					const clearHandoffId =
						typeof data.value?.clearHandoffId === "string" &&
						data.value.clearHandoffId
							? data.value.clearHandoffId
							: null;
					if (clearHandoffId) {
						for (const streamInfo of Object.values(
							__TTVAB_STATE__.StreamInfos,
						)) {
							if (
								nextCodecHandoffContext.MediaKey &&
								_normalizeMediaKey(streamInfo?.MediaKey) !==
									nextCodecHandoffContext.MediaKey
							) {
								continue;
							}
							_clearCodecHandoffState(streamInfo, clearHandoffId);
						}
						if (__TTVAB_STATE__.ActiveCodecHandoffId === clearHandoffId) {
							__TTVAB_STATE__.ActiveCodecHandoffId = null;
							__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
							__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
						}
						break;
					}
					if (!nextHandoffId) {
						break;
					}
					const nextCycleStartedAt = Math.max(
						0,
						Number(data.value?.cycleStartedAt) || 0,
					);
					const encodedCycleStartedAt =
						_getCodecHandoffCycleStartedAt(nextHandoffId);
					const currentAdMediaKey = _normalizeMediaKey(
						__TTVAB_STATE__.CurrentAdMediaKey,
					);
					const currentAdChannel = _normalizeChannelName(
						__TTVAB_STATE__.CurrentAdChannel,
					);
					if (
						!nextCodecHandoffContext.MediaKey ||
						nextCycleStartedAt <= 0 ||
						encodedCycleStartedAt !== nextCycleStartedAt ||
						currentAdMediaKey !== nextCodecHandoffContext.MediaKey ||
						(currentAdChannel &&
							nextCodecHandoffContext.ChannelName &&
							currentAdChannel !== nextCodecHandoffContext.ChannelName)
					) {
						break;
					}
					const nextHandoffInfo =
						__TTVAB_STATE__.StreamInfos[nextCodecHandoffContext.MediaKey] ||
						null;
					if (
						!nextHandoffInfo ||
						!_isCodecHandoffCycleCurrent(
							nextCodecHandoffContext.MediaKey,
							nextCycleStartedAt,
							nextHandoffInfo,
						)
					) {
						break;
					}
					for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
						if (
							nextCodecHandoffContext.MediaKey &&
							_normalizeMediaKey(streamInfo?.MediaKey) !==
								nextCodecHandoffContext.MediaKey
						) {
							continue;
						}
						if (
							!nextCodecHandoffContext.MediaKey &&
							nextCodecHandoffContext.ChannelName &&
							_normalizeChannelName(streamInfo?.ChannelName) !==
								nextCodecHandoffContext.ChannelName
						) {
							continue;
						}
						if (
							!_isCodecHandoffCycleCurrent(
								streamInfo.MediaKey,
								nextCycleStartedAt,
								streamInfo,
							)
						) {
							continue;
						}
						if (streamInfo._CodecHandoffPendingId !== nextHandoffId) {
							streamInfo._CodecHandoffPendingId = nextHandoffId;
							streamInfo._CodecHandoffAcknowledgedId = null;
							streamInfo._CodecHandoffFailedId = null;
						}
						if (
							streamInfo.ModifiedM3U8 &&
							__TTVAB_STATE__.IsAdStrippingEnabled === true
						) {
							streamInfo.IsUsingModifiedM3U8 = true;
						}
					}
					__TTVAB_STATE__.ActiveCodecHandoffId = nextHandoffId;
					__TTVAB_STATE__.ActiveCodecHandoffChannel =
						nextCodecHandoffContext.ChannelName;
					__TTVAB_STATE__.ActiveCodecHandoffMediaKey =
						nextCodecHandoffContext.MediaKey;
				}
				break;
			case "CodecHandoffReloadFailed":
				{
					const failedHandoffId =
						typeof data.value?.handoffId === "string"
							? data.value.handoffId
							: null;
					if (!failedHandoffId) break;
					const failedContext = _normalizePlaybackContext(data.value);
					const failedInfo =
						(failedContext.MediaKey &&
							__TTVAB_STATE__.StreamInfos[failedContext.MediaKey]) ||
						null;
					_markCodecHandoffReloadFailed(failedInfo, failedHandoffId);
					if (__TTVAB_STATE__.ActiveCodecHandoffId === failedHandoffId) {
						__TTVAB_STATE__.ActiveCodecHandoffId = null;
						__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
						__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
					}
				}
				break;
			case "UpdateBackupSearchForceRefresh":
				__TTVAB_STATE__.BackupSearchForceRefreshAt =
					__TTVAB_STATE__.IsAdStrippingEnabled === true
						? Number(data.value) || 0
						: 0;
				break;
			case "ResetPlaybackRecoveryState":
				{
					const preservedMediaKey = _normalizeMediaKey(
						data.value?.preservedMediaKey,
					);
					const isPreservedContext =
						preservedMediaKey &&
						__TTVAB_STATE__.PageMediaKey === preservedMediaKey;
					if (!isPreservedContext) {
						__TTVAB_STATE__.HasTriggeredPlayerReload = false;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
						__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
						__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
						__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
						__TTVAB_STATE__.ShouldResumeAfterAd = false;
						__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
						__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
						__TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
						if (data.value?.clearAdContext) {
							for (const streamInfo of Object.values(
								__TTVAB_STATE__.StreamInfos,
							)) {
								_clearCodecHandoffState(streamInfo);
							}
							__TTVAB_STATE__.CurrentAdChannel = null;
							__TTVAB_STATE__.CurrentAdMediaKey = null;
							__TTVAB_STATE__.PinnedBackupPlayerType = null;
							__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
							__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
							__TTVAB_STATE__.ActiveCodecHandoffId = null;
							__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
							__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
							__TTVAB_STATE__.LastAdEndedAt = 0;
							__TTVAB_STATE__.LastAdEndedChannel = null;
							__TTVAB_STATE__.LastAdEndedMediaKey = null;
							__TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
						}
					}
					const prevMediaKey = data.value?.previousMediaKey || null;
					if (prevMediaKey && prevMediaKey !== preservedMediaKey) {
						_clearAdPodProgress(prevMediaKey);
					}
					if (
						prevMediaKey &&
						prevMediaKey !== preservedMediaKey &&
						typeof __TTVAB_STATE__.StreamInfos === "object"
					) {
						delete __TTVAB_STATE__.StreamInfos[prevMediaKey];
					}
					if (
						prevMediaKey &&
						prevMediaKey !== preservedMediaKey &&
						typeof __TTVAB_STATE__.StreamInfosByUrl === "object"
					) {
						for (const u in __TTVAB_STATE__.StreamInfosByUrl) {
							if (
								__TTVAB_STATE__.StreamInfosByUrl[u]?.MediaKey === prevMediaKey
							) {
								delete __TTVAB_STATE__.StreamInfosByUrl[u];
							}
						}
					}
				}
				break;
			case "ReleasePlaybackContext":
				{
					const releasedContext = _normalizePlaybackContext(data.value);
					const releasedMediaKey = releasedContext.MediaKey;
					if (!releasedMediaKey) break;
					__TTVAB_STATE__.PagePlaybackContextGeneration =
						Math.max(
							0,
							Number(__TTVAB_STATE__.PagePlaybackContextGeneration) || 0,
						) + 1;
					_clearAdPodProgress(releasedMediaKey);
					if (
						releasedMediaKey &&
						typeof __TTVAB_STATE__.StreamInfos === "object"
					) {
						delete __TTVAB_STATE__.StreamInfos[releasedMediaKey];
					}
					if (
						releasedMediaKey &&
						typeof __TTVAB_STATE__.StreamInfosByUrl === "object"
					) {
						for (const u in __TTVAB_STATE__.StreamInfosByUrl) {
							if (
								__TTVAB_STATE__.StreamInfosByUrl[u]?.MediaKey ===
								releasedMediaKey
							) {
								delete __TTVAB_STATE__.StreamInfosByUrl[u];
							}
						}
					}
					if (__TTVAB_STATE__.PageMediaKey === releasedMediaKey) {
						__TTVAB_STATE__.PageMediaType = null;
						__TTVAB_STATE__.PageChannel = null;
						__TTVAB_STATE__.PageVodID = null;
						__TTVAB_STATE__.PageMediaKey = null;
					}
					if (__TTVAB_STATE__.CurrentAdMediaKey === releasedMediaKey) {
						__TTVAB_STATE__.CurrentAdChannel = null;
						__TTVAB_STATE__.CurrentAdMediaKey = null;
					}
					if (__TTVAB_STATE__.PinnedBackupPlayerMediaKey === releasedMediaKey) {
						__TTVAB_STATE__.PinnedBackupPlayerType = null;
						__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
						__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
					}
					if (__TTVAB_STATE__.ActiveCodecHandoffMediaKey === releasedMediaKey) {
						__TTVAB_STATE__.ActiveCodecHandoffId = null;
						__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
						__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
					}
					if (
						__TTVAB_STATE__.ShouldResumeAfterAdMediaKey === releasedMediaKey
					) {
						__TTVAB_STATE__.ShouldResumeAfterAd = false;
						__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
						__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
						__TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
					}
				}
				break;
			case "FetchResponse":
				{
					const responseData = data.value;
					const requestId = responseData?.id || null;
					const pendingRequests = __TTVAB_STATE__.PendingFetchRequests;
					if (!requestId || !pendingRequests?.has(requestId)) break;
					const pendingRequest = pendingRequests.get(requestId);
					pendingRequests.delete(requestId);
					if (responseData?.error) {
						pendingRequest.reject(responseData.error);
					} else {
						pendingRequest.resolve(responseData);
					}
				}
				break;
			case "PreparePostAdNativeReload":
				_updatePostAdNativeMasterReload(
					__TTVAB_STATE__.StreamInfos[data.value?.mediaKey],
					data.value,
					true,
				);
				break;
			case "ReleasePostAdNativeSession":
				{
					const info = __TTVAB_STATE__.StreamInfos[data.value?.mediaKey];
					const session = info?._PendingPostAdNativeMaster;
					const confirmation = info?._PendingNativeReloadConfirmation;
					if (
						confirmation &&
						confirmation.cycleStartedAt ===
							Number(data.value?.cycleStartedAt) &&
						confirmation.reloadAt <= Number(data.value?.reloadAt)
					)
						info._PendingNativeReloadConfirmation = null;
					if (
						session &&
						session.cycleStartedAt === Number(data.value?.cycleStartedAt) &&
						(Number(session.reloadAt) || 0) <= Number(data.value?.reloadAt)
					) {
						_reportPostAdNativeSession(info, "released");
						info._PendingPostAdNativeMaster = null;
					}
				}
				break;
			case "TriggeredPlayerReload":
				{
					const reloadContext = _normalizePlaybackContext(
						data.value || {
							mediaType: __TTVAB_STATE__.PageMediaType,
							channelName: __TTVAB_STATE__.PageChannel,
							vodID: __TTVAB_STATE__.PageVodID,
							mediaKey: __TTVAB_STATE__.PageMediaKey,
						},
					);
					const handoffId =
						data.value?.reason === "codec-handoff" &&
						typeof data.value?.handoffId === "string"
							? data.value.handoffId
							: null;
					const handoffCycleStartedAt = Math.max(
						0,
						Number(data.value?.cycleStartedAt) || 0,
					);
					const reloadAt = Math.max(0, Number(data.value?.reloadAt) || 0);
					const handoffInfo =
						(reloadContext.MediaKey &&
							__TTVAB_STATE__.StreamInfos[reloadContext.MediaKey]) ||
						Object.values(__TTVAB_STATE__.StreamInfos).find(
							(entry) =>
								entry?.MediaKey === reloadContext.MediaKey ||
								(!reloadContext.MediaKey &&
									entry?.ChannelName === reloadContext.ChannelName),
						) ||
						null;
					const handoffOwnsCurrentAd = Boolean(
						handoffId &&
							handoffCycleStartedAt > 0 &&
							_getCodecHandoffCycleStartedAt(handoffId) ===
								handoffCycleStartedAt &&
							reloadContext.MediaKey &&
							handoffInfo &&
							_isCodecHandoffCycleCurrent(
								reloadContext.MediaKey,
								handoffCycleStartedAt,
								handoffInfo,
							) &&
							(!_normalizeChannelName(__TTVAB_STATE__.CurrentAdChannel) ||
								!reloadContext.ChannelName ||
								_normalizeChannelName(__TTVAB_STATE__.CurrentAdChannel) ===
									reloadContext.ChannelName),
					);
					if (handoffId && !handoffOwnsCurrentAd) {
						break;
					}
					if (
						!handoffId &&
						handoffCycleStartedAt > 0 &&
						!_isPageLifecycleCycleCurrent(
							reloadContext.MediaKey,
							handoffCycleStartedAt,
						)
					) {
						break;
					}
					if (handoffOwnsCurrentAd) {
						__TTVAB_STATE__.ActiveCodecHandoffId = handoffId;
						__TTVAB_STATE__.ActiveCodecHandoffChannel =
							reloadContext.ChannelName;
						__TTVAB_STATE__.ActiveCodecHandoffMediaKey = reloadContext.MediaKey;
					}
					if (
						handoffOwnsCurrentAd &&
						handoffInfo?._CodecHandoffPendingId === handoffId
					) {
						handoffInfo._CodecHandoffAcknowledgedId = handoffId;
					}
					const confirmation = handoffInfo?._PendingNativeReloadConfirmation;
					if (
						confirmation?.reloadAt === reloadAt &&
						confirmation.cycleStartedAt === handoffCycleStartedAt &&
						confirmation.mediaKey === reloadContext.MediaKey &&
						confirmation.pageGeneration ===
							(Number(__TTVAB_STATE__.PagePlaybackContextGeneration) || 0) &&
						confirmation.loaderEpoch ===
							(Number(handoffInfo.NativeRecoveryLoaderEpoch) || 0) &&
						Date.now() - reloadAt < 30000
					)
						break;
					const repeatsPendingReload = Boolean(
						reloadAt > 0 &&
							_normalizeMediaKey(
								__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
							) === reloadContext.MediaKey &&
							Math.max(
								0,
								Number(__TTVAB_STATE__.PendingTriggeredPlayerReloadAt) || 0,
							) === reloadAt &&
							Math.max(
								0,
								Number(
									__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt,
								) || 0,
							) === handoffCycleStartedAt,
					);
					if (handoffInfo && !repeatsPendingReload) {
						_invalidateNativeRecoveryAfterPlayerReload(handoffInfo, true);
						_updatePostAdNativeMasterReload(handoffInfo, data.value);
					}
					__TTVAB_STATE__.HasTriggeredPlayerReload = true;
					__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel =
						reloadContext.ChannelName;
					__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey =
						reloadContext.MediaKey;
					__TTVAB_STATE__.PendingTriggeredPlayerReloadAt =
						reloadAt || Date.now();
					__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt =
						handoffCycleStartedAt;
				}
				break;
			default:
				break;
		}
	});

	_hookWorkerErrorDiagnostics();
	_hookWorkerFetch();
}
