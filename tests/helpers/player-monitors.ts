const g = globalThis as Record<string, unknown>;

function call(name: string, ...args: unknown[]) {
	const fn = g[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn(...args);
}

export function stopPlayerBufferMonitor(resetBufferState = true) {
	const bufferState = g._PlayerBufferState as Record<string, unknown>;
	bufferState.cleanPlayback = null;
	if (g._playerBufferMonitorTimer) {
		clearTimeout(g._playerBufferMonitorTimer as ReturnType<typeof setTimeout>);
	}
	g._playerBufferMonitorTimer = null;
	g._playerBufferMonitorStarted = false;
	call("_clearCachedPlayerRef");
	if (resetBufferState) {
		call("_resetPlayerBufferMonitorState");
		bufferState.postAdUnhealthyCount = 0;
		bufferState.postAdRecoveryStartedAt = 0;
	}
}

export function stopPlaybackIntentMonitor(detachObservedMedia = false) {
	if (g._playbackIntentMonitorTimer) {
		clearTimeout(
			g._playbackIntentMonitorTimer as ReturnType<typeof setTimeout>,
		);
	}
	g._playbackIntentMonitorTimer = null;
	if (detachObservedMedia) call("_clearObservedPlaybackIntentMedia");
	g._playbackIntentMonitorStarted = false;
}
