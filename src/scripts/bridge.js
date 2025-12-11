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
 * Update daily statistics
 * @param {string} type - 'ads' or 'popups'
 */
function updateDailyStats(type) {
    chrome.storage.local.get(['ttvStats'], function (result) {
        const stats = result.ttvStats || { daily: {}, channels: {}, achievements: [] };
        const today = getTodayKey();

        if (!stats.daily[today]) {
            stats.daily[today] = { ads: 0, popups: 0 };
        }

        stats.daily[today][type]++;
        stats.lastBlockedAt = Date.now();

        if (!stats.firstBlockedAt) {
            stats.firstBlockedAt = Date.now();
        }

        // Prune old daily entries (keep last 30 days)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffKey = cutoff.toISOString().split('T')[0];

        for (const key in stats.daily) {
            if (key < cutoffKey) {
                delete stats.daily[key];
            }
        }

        chrome.storage.local.set({ ttvStats: stats });
    });
}

/**
 * Update channel-specific statistics
 * @param {string} channel - Channel name
 */
function updateChannelStats(channel) {
    if (!channel) return;

    chrome.storage.local.get(['ttvStats'], function (result) {
        const stats = result.ttvStats || { daily: {}, channels: {}, achievements: [] };

        if (!stats.channels[channel]) {
            stats.channels[channel] = 0;
        }
        stats.channels[channel]++;

        chrome.storage.local.set({ ttvStats: stats });
    });
}

/**
 * Check and unlock achievements
 * @param {number} adsBlocked - Total ads blocked
 * @param {number} popupsBlocked - Total popups blocked
 */
function checkAchievements(adsBlocked, popupsBlocked) {
    chrome.storage.local.get(['ttvStats'], function (result) {
        const stats = result.ttvStats || { daily: {}, channels: {}, achievements: [] };
        const unlocked = stats.achievements || [];

        // Achievement definitions (must match constants.js)
        const achievements = [
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

        // Calculate derived metrics
        const timeSaved = adsBlocked * 22; // AVG_AD_DURATION
        const channelCount = Object.keys(stats.channels || {}).length;

        let newUnlocks = [];

        for (const ach of achievements) {
            if (unlocked.includes(ach.id)) continue;

            let value = 0;
            switch (ach.type) {
                case 'ads': value = adsBlocked; break;
                case 'popups': value = popupsBlocked; break;
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
            chrome.storage.local.set({ ttvStats: stats });

            // Notify content script of new achievements
            for (const id of newUnlocks) {
                window.dispatchEvent(new CustomEvent('ttvab-achievement-unlocked', { detail: { id: id } }));
            }
        }
    });
}

// Send initial state and stored counters to content script
chrome.storage.local.get(['ttvAdblockEnabled', 'ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
    const enabled = result.ttvAdblockEnabled !== false;
    const storedAdsCount = result.ttvAdsBlocked || 0;
    const storedPopupsCount = result.ttvPopupsBlocked || 0;

    // Send toggle state
    window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled } }));

    // Send stored counters so content script can accumulate from them
    window.dispatchEvent(new CustomEvent('ttvab-init-count', { detail: { count: storedAdsCount } }));
    window.dispatchEvent(new CustomEvent('ttvab-init-popups-count', { detail: { count: storedPopupsCount } }));
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled: message.enabled } }));
        sendResponse({ success: true });
    } else if (message.action === 'getAdsBlocked') {
        chrome.storage.local.get(['ttvAdsBlocked'], function (result) {
            sendResponse({ count: result.ttvAdsBlocked || 0 });
        });
        return true; // Keep channel open for async response
    }
});

// Listen for ad blocked events from content script and sync to storage
window.addEventListener('ttvab-ad-blocked', function (e) {
    const count = e.detail?.count || 0;
    const channel = e.detail?.channel || null;

    chrome.storage.local.set({ ttvAdsBlocked: count });
    updateDailyStats('ads');

    if (channel) {
        updateChannelStats(channel);
    }

    // Check for achievement unlocks
    chrome.storage.local.get(['ttvPopupsBlocked'], function (result) {
        checkAchievements(count, result.ttvPopupsBlocked || 0);
    });
});

// Listen for popup blocked events from content script and sync to storage
window.addEventListener('ttvab-popup-blocked', function (e) {
    const count = e.detail?.count || 0;

    chrome.storage.local.set({ ttvPopupsBlocked: count });
    updateDailyStats('popups');

    // Check for achievement unlocks
    chrome.storage.local.get(['ttvAdsBlocked'], function (result) {
        checkAchievements(result.ttvAdsBlocked || 0, count);
    });
});
