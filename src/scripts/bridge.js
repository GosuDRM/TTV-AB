/**
 * TTV AB - Bridge Script
 * Runs in ISOLATED world to bridge communication between
 * popup (extension) and content.js (MAIN world)
 * 
 * @author GosuDRM
 * @license MIT
 */

/**
 * Get today's date string in YYYY-MM-DD format
 * @returns {string}
 */
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Achievement definitions
 * @type {Array}
 */
const ACHIEVEMENTS = [
    { id: 'first_block', threshold: 1, type: 'ads' },
    { id: 'block_10', threshold: 10, type: 'ads' },
    { id: 'block_100', threshold: 100, type: 'ads' },
    { id: 'block_500', threshold: 500, type: 'ads' },
    { id: 'block_1000', threshold: 1000, type: 'ads' },
    { id: 'block_5000', threshold: 5000, type: 'ads' },
    { id: 'popup_10', threshold: 10, type: 'popups' },
    { id: 'popup_50', threshold: 50, type: 'popups' },
    { id: 'time_1h', threshold: 3600, type: 'time' },
    { id: 'time_10h', threshold: 36000, type: 'time' },
    { id: 'channels_5', threshold: 5, type: 'channels' },
    { id: 'channels_20', threshold: 20, type: 'channels' }
];

/** 
 * Average ad duration in seconds
 * SYNC: Must match constants.js and popup.js
 * @type {number} 
 */
const AVG_AD_DURATION = 22;

/** @type {number} Maximum channels to store */
const MAX_CHANNELS = 100;

/**
 * Queue for serializing storage operations to prevent race conditions
 */
const StorageQueue = {
    _chain: Promise.resolve(),
    /**
     * Add a task to the queue
     * @param {Function} task - Function that returns a Promise
     */
    add(task) {
        this._chain = this._chain.then(task).catch(err => {
            console.error('TTV AB Storage Error:', err);
        });
    }
};

/**
 * Consolidated stats update function - fixes race condition by doing single atomic read/write
 * @param {string} type - 'ads' or 'popups'
 * @param {string|null} channel - Channel name (for ads only)
 * @param {number} totalAdsBlocked - Current total ads blocked
 * @param {number} totalPopupsBlocked - Current total popups blocked
 */
function updateStats(type, channel, totalAdsBlocked, totalPopupsBlocked) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['ttvStats'], function (result) {
            const stats = result.ttvStats || { daily: {}, channels: {}, achievements: [] };
            const today = getTodayKey();

            // 1. Update daily stats
            if (!stats.daily[today]) {
                stats.daily[today] = { ads: 0, popups: 0 };
            }
            stats.daily[today][type]++;
            stats.lastBlockedAt = Date.now();
            if (!stats.firstBlockedAt) {
                stats.firstBlockedAt = Date.now();
            }

            // 2. Prune old daily entries (keep last 30 days)
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const cutoffKey = cutoff.toISOString().split('T')[0];
            for (const key in stats.daily) {
                if (key < cutoffKey) {
                    delete stats.daily[key];
                }
            }

            // 3. Update channel stats (for ads only)
            if (type === 'ads' && channel) {
                if (!stats.channels[channel]) {
                    stats.channels[channel] = 0;
                }
                stats.channels[channel]++;

                // 4. Prune channels to top MAX_CHANNELS by count
                const channelEntries = Object.entries(stats.channels);
                if (channelEntries.length > MAX_CHANNELS) {
                    channelEntries.sort((a, b) => b[1] - a[1]);
                    stats.channels = Object.fromEntries(channelEntries.slice(0, MAX_CHANNELS));
                }
            }

            // 5. Check achievements
            const unlocked = stats.achievements || [];
            const timeSaved = totalAdsBlocked * AVG_AD_DURATION;
            const channelCount = Object.keys(stats.channels).length;
            const newUnlocks = [];

            for (const ach of ACHIEVEMENTS) {
                if (unlocked.includes(ach.id)) continue;

                let value = 0;
                switch (ach.type) {
                    case 'ads': value = totalAdsBlocked; break;
                    case 'popups': value = totalPopupsBlocked; break;
                    case 'time': value = timeSaved; break;
                    case 'channels': value = channelCount; break;
                }

                if (value >= ach.threshold) {
                    unlocked.push(ach.id);
                    newUnlocks.push(ach.id);
                }
            }

            if (newUnlocks.length > 0) {
                stats.achievements = unlocked;
            }

            // 6. Single atomic write
            chrome.storage.local.set({ ttvStats: stats }, function () {
                // Notify content script of new achievements after storage is saved
                for (const id of newUnlocks) {
                    document.dispatchEvent(new CustomEvent('ttvab-achievement-unlocked', { detail: { id: id } }));
                }
                resolve();
            });
        });
    });
}

// Send initial state and stored counters to content script
chrome.storage.local.get(['ttvAdblockEnabled', 'ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
    const enabled = result.ttvAdblockEnabled !== false;
    const storedAdsCount = result.ttvAdsBlocked || 0;
    const storedPopupsCount = result.ttvPopupsBlocked || 0;

    // Helper to broadcast state to content script
    function broadcastState() {
        // Send toggle state
        document.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled } }));
        // Send stored counters
        document.dispatchEvent(new CustomEvent('ttvab-init-count', { detail: { count: storedAdsCount } }));
        document.dispatchEvent(new CustomEvent('ttvab-init-popups-count', { detail: { count: storedPopupsCount } }));
    }

    // Broadcast immediately on load
    broadcastState();

    // Listen for request from content script (handshake)
    document.addEventListener('ttvab-request-state', function () {
        broadcastState();
    });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        document.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled: message.enabled } }));
        sendResponse({ success: true });
    } else if (message.action === 'getAdsBlocked') {
        chrome.storage.local.get(['ttvAdsBlocked'], function (result) {
            sendResponse({ count: result.ttvAdsBlocked || 0 });
        });
        return true; // Keep channel open for async response
    }
});

// Listen for ad blocked events from content script and sync to storage
// Uses atomic increment to handle multiple tabs correctly
// Listen for ad blocked events from content script and sync to storage
// Uses StorageQueue to prevent race conditions
document.addEventListener('ttvab-ad-blocked', function (e) {
    const channel = e.detail?.channel || null;

    StorageQueue.add(() => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
                const newCount = (result.ttvAdsBlocked || 0) + 1;
                chrome.storage.local.set({ ttvAdsBlocked: newCount }, async function () {
                    // Update stats with the new total
                    await updateStats('ads', channel, newCount, result.ttvPopupsBlocked || 0);
                    resolve();
                });
            });
        });
    });
});

// Listen for popup blocked events from content script and sync to storage
// Uses StorageQueue to prevent race conditions
document.addEventListener('ttvab-popup-blocked', function (_e) {
    StorageQueue.add(() => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
                const newCount = (result.ttvPopupsBlocked || 0) + 1;
                chrome.storage.local.set({ ttvPopupsBlocked: newCount }, async function () {
                    // Update stats with the new total
                    await updateStats('popups', null, result.ttvAdsBlocked || 0, newCount);
                    resolve();
                });
            });
        });
    });
});
