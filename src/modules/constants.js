/**
 * TTV AB - Constants Module
 * Core configuration and version info
 * @module constants
 * @private
 */

/** @type {Object} Configuration constants */
const _C = {
    /** Extension version */
    VERSION: '3.3.9',
    /** Internal version for conflict detection */
    INTERNAL_VERSION: 28,
    /** Console log styling */
    LOG_STYLES: {
        prefix: 'background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
        info: 'color: #9146FF; font-weight: 500;',
        success: 'color: #4CAF50; font-weight: 500;',
        warning: 'color: #FF9800; font-weight: 500;',
        error: 'color: #f44336; font-weight: 500;'
    },
    /** M3U8 ad segment identifier */
    AD_SIGNIFIER: 'stitched',
    /** Twitch API client ID */
    CLIENT_ID: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    /** Backup player types to try */
    PLAYER_TYPES: ['embed', 'site', 'autoplay', 'picture-by-picture-CACHED'],
    /** Fallback player type */
    FALLBACK_TYPE: 'embed',
    /** Forced player type for tokens */
    FORCE_TYPE: 'site',
    /** Minimum time between reloads (ms) */
    RELOAD_TIME: 1500,
    /** Error patterns indicating player crash */
    CRASH_PATTERNS: ['Error #1000', 'Error #2000', 'Error #3000', 'Error #4000', 'Error #5000', 'network error', 'content is not available'],
    /** Delay before auto-refresh (ms) */
    REFRESH_DELAY: 1000,
    /** 
     * Average Twitch ad duration in seconds (for time saved calculation)
     * SYNC: Must match popup.js and bridge.js
     */
    AVG_AD_DURATION: 22,
    /** Achievement badges definitions */
    ACHIEVEMENTS: [
        { id: 'first_block', name: 'Ad Slayer', icon: '⚔️', threshold: 1, type: 'ads', desc: 'Block your first ad' },
        { id: 'block_10', name: 'Blocker', icon: '🛡️', threshold: 10, type: 'ads', desc: 'Block 10 ads' },
        { id: 'block_100', name: 'Guardian', icon: '🔰', threshold: 100, type: 'ads', desc: 'Block 100 ads' },
        { id: 'block_500', name: 'Sentinel', icon: '🏰', threshold: 500, type: 'ads', desc: 'Block 500 ads' },
        { id: 'block_1000', name: 'Legend', icon: '🏆', threshold: 1000, type: 'ads', desc: 'Block 1000 ads' },
        { id: 'block_5000', name: 'Mythic', icon: '👑', threshold: 5000, type: 'ads', desc: 'Block 5000 ads' },
        { id: 'popup_10', name: 'Popup Crusher', icon: '💥', threshold: 10, type: 'popups', desc: 'Block 10 popups' },
        { id: 'popup_50', name: 'Popup Destroyer', icon: '🔥', threshold: 50, type: 'popups', desc: 'Block 50 popups' },
        { id: 'time_1h', name: 'Hour Saver', icon: '⏱️', threshold: 3600, type: 'time', desc: 'Save 1 hour from ads' },
        { id: 'time_10h', name: 'Time Master', icon: '⏰', threshold: 36000, type: 'time', desc: 'Save 10 hours from ads' },
        { id: 'channels_5', name: 'Explorer', icon: '📺', threshold: 5, type: 'channels', desc: 'Block ads on 5 channels' },
        { id: 'channels_20', name: 'Adventurer', icon: '🌍', threshold: 20, type: 'channels', desc: 'Block ads on 20 channels' }
    ]
};
