// TTV AB - Bridge Script (ISOLATED world)
// https://github.com/GosuDRM/TTV-AB | MIT License

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

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

const AVG_AD_DURATION = 22;
const MAX_CHANNELS = 100;

const StorageQueue = {
    _chain: Promise.resolve(),
    add(task) {
        const withRetry = async () => {
            const maxRetries = 3;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await task();
                } catch (err) {
                    if (i === maxRetries - 1) throw err;
                    await new Promise(r => setTimeout(r, Math.pow(2, i) * 200));
                }
            }
        };

        this._chain = this._chain.then(withRetry).catch(err => {
            console.error('TTV AB Storage Error:', err);
        });
    }
};

function updateStats(type, channel, totalAdsBlocked, totalPopupsBlocked) {
    return new Promise((resolve) => {
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

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const cutoffKey = cutoff.toISOString().split('T')[0];
            for (const key in stats.daily) {
                if (key < cutoffKey) {
                    delete stats.daily[key];
                }
            }

            if (type === 'ads' && channel) {
                if (!stats.channels[channel]) {
                    stats.channels[channel] = 0;
                }
                stats.channels[channel]++;

                const channelEntries = Object.entries(stats.channels);
                if (channelEntries.length > MAX_CHANNELS) {
                    channelEntries.sort((a, b) => b[1] - a[1]);
                    stats.channels = Object.fromEntries(channelEntries.slice(0, MAX_CHANNELS));
                }
            }

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

            chrome.storage.local.set({ ttvStats: stats }, function () {
                for (const id of newUnlocks) {
                    window.postMessage({ type: 'ttvab-achievement-unlocked', detail: { id: id } }, '*');
                }
                resolve();
            });
        });
    });
}

chrome.storage.local.get(['ttvAdblockEnabled', 'ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
    const enabled = result.ttvAdblockEnabled !== false;
    const storedAdsCount = result.ttvAdsBlocked || 0;
    const storedPopupsCount = result.ttvPopupsBlocked || 0;

    function broadcastState() {
        window.postMessage({ type: 'ttvab-toggle', detail: { enabled } }, '*');
        window.postMessage({ type: 'ttvab-init-count', detail: { count: storedAdsCount } }, '*');
        window.postMessage({ type: 'ttvab-init-popups-count', detail: { count: storedPopupsCount } }, '*');
    }

    broadcastState();

    window.addEventListener('message', function (e) {
        if (e.data?.type === 'ttvab-request-state') {
            broadcastState();
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        window.postMessage({ type: 'ttvab-toggle', detail: { enabled: message.enabled } }, '*');
        sendResponse({ success: true });
    } else if (message.action === 'getAdsBlocked') {
        chrome.storage.local.get(['ttvAdsBlocked'], function (result) {
            sendResponse({ count: result.ttvAdsBlocked || 0 });
        });
        return true;
    }
});

let adsEventsSinceCheck = 0;
let lastKnownAdsCount = 0;

window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (!e.data?.type?.startsWith('ttvab-')) return;

    if (e.data.type === 'ttvab-ad-blocked') {
        const channel = e.data.detail?.channel || null;
        adsEventsSinceCheck++;

        StorageQueue.add(() => {
            return new Promise((resolve) => {
                chrome.storage.local.get(['ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
                    if (chrome.runtime.lastError) {
                        console.error('[TTV AB] Storage read error:', chrome.runtime.lastError.message);
                        resolve();
                        return;
                    }

                    const oldCount = result.ttvAdsBlocked || 0;
                    const newCount = oldCount + 1;

                    chrome.storage.local.set({ ttvAdsBlocked: newCount }, async function () {
                        if (chrome.runtime.lastError) {
                            console.error('[TTV AB] Storage write error:', chrome.runtime.lastError.message);
                            resolve();
                            return;
                        }

                        try {
                            await updateStats('ads', channel, newCount, result.ttvPopupsBlocked || 0);
                        } catch (statsErr) {
                            console.error('[TTV AB] Stats error:', statsErr.message);
                        }
                        resolve();
                    });
                });
            });
        });
    }

    if (e.data.type === 'ttvab-popup-blocked') {
        StorageQueue.add(() => {
            return new Promise((resolve) => {
                chrome.storage.local.get(['ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
                    if (chrome.runtime.lastError) {
                        console.error('[TTV AB] Storage read error:', chrome.runtime.lastError.message);
                        resolve();
                        return;
                    }

                    const oldCount = result.ttvPopupsBlocked || 0;
                    const newCount = oldCount + 1;

                    chrome.storage.local.set({ ttvPopupsBlocked: newCount }, async function () {
                        if (chrome.runtime.lastError) {
                            console.error('[TTV AB] Storage write error:', chrome.runtime.lastError.message);
                            resolve();
                            return;
                        }

                        try {
                            await updateStats('popups', null, result.ttvAdsBlocked || 0, newCount);
                        } catch (statsErr) {
                            console.error('[TTV AB] Stats error:', statsErr.message);
                        }
                        resolve();
                    });
                });
            });
        });
    }
});

setInterval(function () {
    if (adsEventsSinceCheck > 0) {
        chrome.storage.local.get(['ttvAdsBlocked'], function (result) {
            const currentCount = result.ttvAdsBlocked || 0;
            const expectedIncrease = adsEventsSinceCheck;
            const actualIncrease = currentCount - lastKnownAdsCount;

            if (actualIncrease < expectedIncrease) {
                console.error('[TTV AB] Counter health check failed: Expected +' + expectedIncrease + ', got +' + actualIncrease);
            }

            lastKnownAdsCount = currentCount;
            adsEventsSinceCheck = 0;
        });
    }
}, 60000);
