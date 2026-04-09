// TTV AB - Constants

const _C = {
	VERSION: "6.1.3",
	INTERNAL_VERSION: 79,
	LOG_STYLES: {
		prefix:
			"background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
		info: "color: #9146FF; font-weight: 500;",
		success: "color: #4CAF50; font-weight: 500;",
		warning: "color: #FF9800; font-weight: 500;",
		error: "color: #f44336; font-weight: 500;",
	},
	AD_SIGNIFIER: "stitched",
	CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
	PLAYER_TYPES: ["embed", "popout", "autoplay"],
	FALLBACK_TYPE: "embed",
	FORCE_TYPE: "popout",
	RELOAD_TIME: 1500,
	PLAYER_RELOAD_DEBOUNCE_MS: 1500,
	AD_CYCLE_STALE_MS: 30000,
	AD_END_GRACE_MS: 2500,
	AD_END_MIN_CLEAN_PLAYLISTS: 2,
	AD_END_MIN_NATIVE_RECOVERY_PROBES: 3,
	AD_RECOVERY_RELOAD_COOLDOWN_MS: 10000,
	BUFFERING_FIX: true,
	RELOAD_AFTER_AD: false,
	REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN: false,
	PLAYER_BUFFERING_DO_PLAYER_RELOAD: false,
	ALWAYS_RELOAD_PLAYER_ON_AD: false,
};
