/**
 * TTV AB - Player Module
 * Twitch player control and React integration
 * @module player
 * @private
 */

/**
 * Player state for buffering monitoring
 * @type {Object}
 */
const _PlayerBufferState = {
    position: 0,
    bufferedPosition: 0,
    bufferDuration: 0,
    numSame: 0,
    lastFixTime: 0,
    isLive: true
};

/**
 * Cached player reference for performance
 * @type {Object|null}
 */
let _cachedPlayerRef = null;

/**
 * Find React root node in DOM
 * @returns {Object|null} React internal root node
 */
function _findReactRoot() {
    const rootNode = document.querySelector('#root');
    if (!rootNode) return null;

    // Try modern React 18+ container
    if (rootNode._reactRootContainer?._internalRoot?.current) {
        return rootNode._reactRootContainer._internalRoot.current;
    }

    // Try React 17 style
    const containerName = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
    if (containerName) {
        return rootNode[containerName];
    }

    return null;
}

/**
 * Recursively search React fiber tree for matching node
 * @param {Object} root - React fiber node
 * @param {Function} constraint - Matching function
 * @returns {Object|null} Matching state node
 */
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

/**
 * Get Twitch player and state instances from React tree
 * @returns {{player: Object|null, state: Object|null}}
 */
function _getPlayerAndState() {
    const reactRoot = _findReactRoot();
    if (!reactRoot) return { player: null, state: null };

    // Find player component
    let player = _findReactNode(reactRoot, node =>
        node.setPlayerActive && node.props?.mediaPlayerInstance
    );
    player = player?.props?.mediaPlayerInstance || null;

    // Find player state component
    const playerState = _findReactNode(reactRoot, node =>
        node.setSrc && node.setInitialPlaybackSettings
    );

    return { player, state: playerState };
}

/**
 * Execute player task (pause/play or reload)
 * @param {boolean} isPausePlay - Do pause/play cycle
 * @param {boolean} isReload - Do player reload
 */
function _doPlayerTask(isPausePlay, isReload) {
    const { player, state: playerState } = _getPlayerAndState();

    if (!player) {
        _log('Could not find player', 'warning');
        return;
    }

    if (!playerState) {
        _log('Could not find player state', 'warning');
        return;
    }

    // Don't interrupt if paused
    if (player.isPaused() || player.core?.paused) return;

    if (isPausePlay) {
        player.pause();
        player.play();
        return;
    }

    if (isReload) {
        const lsKeyQuality = 'video-quality';
        const lsKeyMuted = 'video-muted';
        const lsKeyVolume = 'volume';

        let currentQualityLS = null;
        let currentMutedLS = null;
        let currentVolumeLS = null;

        try {
            currentQualityLS = localStorage.getItem(lsKeyQuality);
            currentMutedLS = localStorage.getItem(lsKeyMuted);
            currentVolumeLS = localStorage.getItem(lsKeyVolume);

            // Preserve current quality if localStorage hooks failed
            if (player?.core?.state) {
                localStorage.setItem(lsKeyMuted, JSON.stringify({ default: player.core.state.muted }));
                localStorage.setItem(lsKeyVolume, player.core.state.volume);
            }
            if (player?.core?.state?.quality?.group) {
                localStorage.setItem(lsKeyQuality, JSON.stringify({ default: player.core.state.quality.group }));
            }
        } catch { /* Ignore storage errors */ }

        _log('Reloading player', 'info');
        playerState.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });

        // Notify workers of reload
        for (const worker of _S.workers) {
            worker.postMessage({ key: 'TriggeredPlayerReload' });
        }

        player.play();

        // Restore settings after reload
        if (currentQualityLS || currentMutedLS || currentVolumeLS) {
            setTimeout(() => {
                try {
                    if (currentQualityLS) localStorage.setItem(lsKeyQuality, currentQualityLS);
                    if (currentMutedLS) localStorage.setItem(lsKeyMuted, currentMutedLS);
                    if (currentVolumeLS) localStorage.setItem(lsKeyVolume, currentVolumeLS);
                } catch { /* Ignore */ }
            }, 3000);
        }
    }
}

/**
 * Monitor player for buffering issues and auto-fix
 * Uses pause/play or reload to recover from stalls
 */
function _monitorPlayerBuffering() {
    const BUFFERING_DELAY = 500; // Check interval (ms)
    const SAME_STATE_COUNT = 3;  // Trigger after this many same states
    const DANGER_ZONE = 1;       // Buffer seconds before danger
    const MIN_REPEAT_DELAY = 5000; // Min delay between fixes

    function check() {
        if (_cachedPlayerRef) {
            try {
                const player = _cachedPlayerRef.player;
                const state = _cachedPlayerRef.state;

                if (!player.core) {
                    _cachedPlayerRef = null;
                } else if (
                    state?.props?.content?.type === 'live' &&
                    !player.isPaused() &&
                    !player.getHTMLVideoElement()?.ended &&
                    _PlayerBufferState.lastFixTime <= Date.now() - MIN_REPEAT_DELAY
                ) {
                    const position = player.core?.state?.position || 0;
                    const bufferedPosition = player.core?.state?.bufferedPosition || 0;
                    const bufferDuration = player.getBufferDuration() || 0;

                    // Check if stuck
                    if (
                        position > 0 &&
                        (_PlayerBufferState.position === position || bufferDuration < DANGER_ZONE) &&
                        _PlayerBufferState.bufferedPosition === bufferedPosition &&
                        _PlayerBufferState.bufferDuration >= bufferDuration &&
                        (position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0)
                    ) {
                        _PlayerBufferState.numSame++;

                        if (_PlayerBufferState.numSame === SAME_STATE_COUNT) {
                            _log('Attempting to fix buffering (pos=' + position + ')', 'warning');
                            _doPlayerTask(true, false); // Pause/play
                            _PlayerBufferState.lastFixTime = Date.now();
                        }
                    } else {
                        _PlayerBufferState.numSame = 0;
                    }

                    _PlayerBufferState.position = position;
                    _PlayerBufferState.bufferedPosition = bufferedPosition;
                    _PlayerBufferState.bufferDuration = bufferDuration;
                }
            } catch (err) {
                _log('Buffer monitor error: ' + err.message, 'error');
                _cachedPlayerRef = null;
            }
        }

        // Refresh player reference if needed
        if (!_cachedPlayerRef) {
            const playerAndState = _getPlayerAndState();
            if (playerAndState.player && playerAndState.state) {
                _cachedPlayerRef = playerAndState;
            }
        }

        // Track live state for UI updates
        const isLive = _cachedPlayerRef?.state?.props?.content?.type === 'live';
        _PlayerBufferState.isLive = isLive;

        setTimeout(check, BUFFERING_DELAY);
    }

    check();
    _log('Player buffering monitor active', 'info');
}

/**
 * Hook visibility state to prevent player pause when tab is hidden
 * Twitch pauses the player when switching tabs during ads - this prevents that
 */
function _hookVisibilityState() {
    try {
        // Override visibilityState to always appear visible
        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible'
        });
    } catch { /* Already defined */ }

    // Cache original hidden getters
    const hiddenGetter = document.__lookupGetter__('hidden');
    const webkitHiddenGetter = document.__lookupGetter__('webkitHidden');

    try {
        Object.defineProperty(document, 'hidden', {
            get: () => false
        });
    } catch { /* Already defined */ }

    // Block visibility change events
    const blockEvent = e => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };

    let wasVideoPlaying = true;

    const handleVisibilityChange = e => {
        // Handle video play state restoration
        if (typeof chrome !== 'undefined') {
            const videos = document.getElementsByTagName('video');
            if (videos.length > 0) {
                const isHidden = (hiddenGetter?.apply(document) === true) ||
                    (webkitHiddenGetter?.apply(document) === true);

                if (isHidden) {
                    wasVideoPlaying = !videos[0].paused && !videos[0].ended;
                } else if (wasVideoPlaying && !videos[0].ended && videos[0].paused && videos[0].muted) {
                    videos[0].play();
                }
            }
        }
        blockEvent(e);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    document.addEventListener('webkitvisibilitychange', handleVisibilityChange, true);
    document.addEventListener('mozvisibilitychange', handleVisibilityChange, true);
    document.addEventListener('hasFocus', blockEvent, true);

    try {
        if (/Firefox/.test(navigator.userAgent)) {
            Object.defineProperty(document, 'mozHidden', { get: () => false });
        } else {
            Object.defineProperty(document, 'webkitHidden', { get: () => false });
        }
    } catch { /* Already defined */ }

    _log('Visibility state protection active', 'info');
}

/**
 * Hook localStorage to preserve player settings across reloads
 * Caches quality, volume, low latency, and mini player settings
 */
function _hookLocalStoragePreservation() {
    try {
        const keysToCache = [
            'video-quality',
            'video-muted',
            'volume',
            'lowLatencyModeEnabled',
            'persistenceEnabled'
        ];

        const cachedValues = new Map();

        // Pre-cache current values
        for (const key of keysToCache) {
            cachedValues.set(key, localStorage.getItem(key));
        }

        const realSetItem = localStorage.setItem;
        const realGetItem = localStorage.getItem;

        localStorage.setItem = function (key, value) {
            if (cachedValues.has(key)) {
                cachedValues.set(key, value);
            }
            return realSetItem.apply(this, arguments);
        };

        localStorage.getItem = function (key) {
            if (cachedValues.has(key)) {
                return cachedValues.get(key);
            }
            return realGetItem.apply(this, arguments);
        };

        _log('LocalStorage preservation active', 'info');
    } catch (err) {
        _log('LocalStorage hooks failed: ' + err.message, 'warning');
    }
}
