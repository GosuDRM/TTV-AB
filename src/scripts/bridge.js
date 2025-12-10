/**
 * TTV AB - Bridge Script
 * Runs in ISOLATED world to bridge communication between
 * popup (extension) and content.js (MAIN world)
 * 
 * @author GosuDRM
 * @license MIT
 */

// Send initial state and stored counter to content script
chrome.storage.local.get(['ttvAdblockEnabled', 'ttvAdsBlocked'], function (result) {
    const enabled = result.ttvAdblockEnabled !== false;
    const storedCount = result.ttvAdsBlocked || 0;

    // Send toggle state
    window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled } }));

    // Send stored counter so content script can accumulate from it
    window.dispatchEvent(new CustomEvent('ttvab-init-count', { detail: { count: storedCount } }));
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
    chrome.storage.local.set({ ttvAdsBlocked: count });
});
