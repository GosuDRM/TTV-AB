// TTV AB - Player

const _PlayerBufferState = {
	position: 0,
	bufferedPosition: 0,
	bufferDuration: 0,
	numSame: 0,
	lastFixTime: 0,
};

let _cachedPlayerRef = null;

function _getPlayerCore(player) {
	return player?.playerInstance?.core || player?.core || null;
}

function _findReactRoot() {
	const rootNode = document.querySelector("#root");
	if (!rootNode) return null;

	if (rootNode._reactRootContainer?._internalRoot?.current) {
		return rootNode._reactRootContainer._internalRoot.current;
	}

	const containerName = Object.keys(rootNode).find((x) =>
		x.startsWith("__reactContainer"),
	);
	if (containerName) {
		return rootNode[containerName];
	}

	return null;
}

function _findReactNode(root, constraint) {
	if (!root) return null;

	if (root.stateNode && constraint(root.stateNode)) {
		return root.stateNode;
	}

	let node = root.child;
	while (node) {
		const result = _findReactNode(node, constraint);
		if (result) return result;
		node = node.sibling;
	}

	return null;
}

function _getPlayerAndState() {
	const reactRoot = _findReactRoot();
	if (!reactRoot) return { player: null, state: null };

	let player = _findReactNode(
		reactRoot,
		(node) => node.setPlayerActive && node.props?.mediaPlayerInstance,
	);
	player = player?.props?.mediaPlayerInstance || null;

	const playerState = _findReactNode(
		reactRoot,
		(node) => node.setSrc && node.setInitialPlaybackSettings,
	);

	return { player, state: playerState };
}

function _doPlayerTask(isPausePlay, isReload, options = {}) {
	const { player, state: playerState } = _getPlayerAndState();

	if (!player) {
		_log("Could not find player", "warning");
		return;
	}

	if (!playerState) {
		_log("Could not find player state", "warning");
		return;
	}

	const playerCore = _getPlayerCore(player);

	if (isPausePlay) {
		if (player.isPaused() || playerCore?.paused) return;
		player.pause();
		player.play();
		return true;
	}

	if (isReload) {
		const reason = options.reason || "manual";
		const now = Date.now();
		const lastPlayerReloadAt = __TTVAB_STATE__.LastPlayerReloadAt || 0;
		if (
			lastPlayerReloadAt &&
			now - lastPlayerReloadAt < __TTVAB_STATE__.PlayerReloadDebounceMs
		) {
			_log(`Suppressing duplicate reload (${reason})`, "warning");
			return false;
		}

		if (
			reason === "ad-recovery" &&
			__TTVAB_STATE__.CurrentAdChannel &&
			__TTVAB_STATE__.LastAdRecoveryReloadAt &&
			now - __TTVAB_STATE__.LastAdRecoveryReloadAt <
				__TTVAB_STATE__.AdRecoveryReloadCooldownMs
		) {
			_log(
				`Suppressing duplicate ad recovery reload for ${__TTVAB_STATE__.CurrentAdChannel}`,
				"warning",
			);
			return false;
		}

		__TTVAB_STATE__.LastPlayerReloadAt = now;
		if (reason === "ad-recovery") {
			__TTVAB_STATE__.LastAdRecoveryReloadAt = now;
		}

		const lsKeyQuality = "video-quality";
		const lsKeyMuted = "video-muted";
		const lsKeyVolume = "volume";

		let currentQualityLS = null;
		let currentMutedLS = null;
		let currentVolumeLS = null;

		try {
			currentQualityLS = localStorage.getItem(lsKeyQuality);
			currentMutedLS = localStorage.getItem(lsKeyMuted);
			currentVolumeLS = localStorage.getItem(lsKeyVolume);

			if (playerCore?.state) {
				localStorage.setItem(
					lsKeyMuted,
					JSON.stringify({ default: playerCore.state.muted }),
				);
				localStorage.setItem(lsKeyVolume, playerCore.state.volume);
			}
			if (playerCore?.state?.quality?.group) {
				localStorage.setItem(
					lsKeyQuality,
					JSON.stringify({ default: playerCore.state.quality.group }),
				);
			}
		} catch {}

		if (reason === "manual") {
			_log("Reloading player", "info");
		}
		playerState.setSrc({
			isNewMediaPlayerInstance: true,
			refreshAccessToken: true,
		});

		_broadcastWorkers({ key: "TriggeredPlayerReload" });

		player.play();

		if (currentQualityLS || currentMutedLS || currentVolumeLS) {
			setTimeout(() => {
				try {
					if (currentQualityLS)
						localStorage.setItem(lsKeyQuality, currentQualityLS);
					if (currentMutedLS) localStorage.setItem(lsKeyMuted, currentMutedLS);
					if (currentVolumeLS)
						localStorage.setItem(lsKeyVolume, currentVolumeLS);
				} catch {}
			}, 3000);
		}

		return true;
	}

	return false;
}

function _monitorPlayerBuffering() {
	function check() {
		if (_cachedPlayerRef) {
			try {
				const player = _cachedPlayerRef.player;
				const state = _cachedPlayerRef.state;
				const playerCore = _getPlayerCore(player);

				if (!playerCore) {
					_cachedPlayerRef = null;
				} else if (
					state?.props?.content?.type === "live" &&
					player.getHTMLVideoElement()?.ended
				) {
					_log("Player hit end of stream during live playback. Recovering...", "warning");
					_doPlayerTask(false, true, { reason: "ad-recovery" });
					_PlayerBufferState.lastFixTime = Date.now();
				} else if (
					state?.props?.content?.type === "live" &&
					!player.isPaused() &&
					!player.getHTMLVideoElement()?.ended &&
					_PlayerBufferState.lastFixTime <=
						Date.now() - __TTVAB_STATE__.PlayerBufferingMinRepeatDelay
				) {
					const position = playerCore?.state?.position || 0;
					const bufferedPosition = playerCore?.state?.bufferedPosition || 0;
					const bufferDuration = player.getBufferDuration() || 0;

					if (
						(!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
							position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
						(_PlayerBufferState.position === position ||
							bufferDuration < __TTVAB_STATE__.PlayerBufferingDangerZone) &&
						_PlayerBufferState.bufferedPosition === bufferedPosition &&
						_PlayerBufferState.bufferDuration >= bufferDuration &&
						(position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0)
					) {
						_PlayerBufferState.numSame++;

						if (
							_PlayerBufferState.numSame ===
							__TTVAB_STATE__.PlayerBufferingSameStateCount
						) {
							_log(`Attempting buffer fix (pos=${position})`, "warning");
							if (__TTVAB_STATE__.PlayerBufferingDoPlayerReload) {
								_doPlayerTask(false, true);
							} else {
								_doPlayerTask(true, false);
							}
							_PlayerBufferState.lastFixTime = Date.now();
							_PlayerBufferState.numSame = 0;
						}
					} else {
						_PlayerBufferState.numSame = 0;
					}

					_PlayerBufferState.position = position;
					_PlayerBufferState.bufferedPosition = bufferedPosition;
					_PlayerBufferState.bufferDuration = bufferDuration;
				}
			} catch (err) {
				_log(`Buffer monitor error: ${err.message}`, "error");
				_cachedPlayerRef = null;
			}
		}

		if (!_cachedPlayerRef) {
			const playerAndState = _getPlayerAndState();
			if (playerAndState.player && playerAndState.state) {
				_cachedPlayerRef = playerAndState;
			}
		}

		setTimeout(check, __TTVAB_STATE__.PlayerBufferingDelay);
	}

	check();
	_log("Buffer monitor active", "info");
}

function _hookVisibilityState() {
	window.__TTVAB_NATIVE_VISIBILITY__ = {
		hidden: document.__lookupGetter__("hidden") || null,
		webkitHidden: document.__lookupGetter__("webkitHidden") || null,
		mozHidden: document.__lookupGetter__("mozHidden") || null,
		visibilityState: document.__lookupGetter__("visibilityState") || null,
	};

	try {
		Object.defineProperty(document, "visibilityState", {
			get: () => "visible",
		});
	} catch {}

	const hiddenGetter = window.__TTVAB_NATIVE_VISIBILITY__.hidden;
	const webkitHiddenGetter = window.__TTVAB_NATIVE_VISIBILITY__.webkitHidden;

	try {
		Object.defineProperty(document, "hidden", {
			get: () => false,
		});
	} catch {}

	const blockEvent = (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	};

	let wasVideoPlaying = true;

	const handleVisibilityChange = (e) => {
		if (typeof chrome !== "undefined") {
			const videos = document.getElementsByTagName("video");
			if (videos.length > 0) {
				const isHidden =
					hiddenGetter?.apply(document) === true ||
					webkitHiddenGetter?.apply(document) === true;

				if (isHidden) {
					wasVideoPlaying = !videos[0].paused && !videos[0].ended;
				} else if (wasVideoPlaying && !videos[0].ended && videos[0].paused) {
					videos[0].play();
				}
			}
		}
		blockEvent(e);
	};

	document.addEventListener("visibilitychange", handleVisibilityChange, true);
	document.addEventListener(
		"webkitvisibilitychange",
		handleVisibilityChange,
		true,
	);
	document.addEventListener(
		"mozvisibilitychange",
		handleVisibilityChange,
		true,
	);
	document.addEventListener("hasFocus", blockEvent, true);

	try {
		if (/Firefox/.test(navigator.userAgent)) {
			Object.defineProperty(document, "mozHidden", { get: () => false });
		} else {
			Object.defineProperty(document, "webkitHidden", { get: () => false });
		}
	} catch {}

	_log("Visibility protection active", "info");
}

function _hookLocalStoragePreservation() {
	try {
		const keysToCache = [
			"video-quality",
			"video-muted",
			"volume",
			"lowLatencyModeEnabled",
			"persistenceEnabled",
		];

		const cachedValues = new Map();

		for (const key of keysToCache) {
			cachedValues.set(key, localStorage.getItem(key));
		}

		const realSetItem = localStorage.setItem;
		const realGetItem = localStorage.getItem;

		localStorage.setItem = function (...args) {
			const [key, value] = args;
			if (cachedValues.has(key)) {
				cachedValues.set(key, value);
			}
			return realSetItem.apply(this, args);
		};

		localStorage.getItem = function (...args) {
			const [key] = args;
			if (cachedValues.has(key)) {
				return cachedValues.get(key);
			}
			return realGetItem.apply(this, args);
		};

		_log("LocalStorage preservation active", "info");
	} catch (err) {
		_log(`LocalStorage hooks failed: ${err.message}`, "warning");
	}
}
