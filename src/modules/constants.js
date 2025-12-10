/**
 * TTV AB - Constants Module
 * Core configuration and version info
 * @module constants
 * @private
 */

/** @type {Object} Configuration constants */
const _C = {
    /** Extension version */
    VERSION: '3.0.8',
    /** Internal version for conflict detection */
    INTERNAL_VERSION: 20,
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
    REFRESH_DELAY: 1500
};
