/**
 * TTV AB - Bridge Script
 * Runs in ISOLATED world to bridge communication between
 * popup (extension) and content.js (MAIN world)
 * 
 * @author GosuDRM
 * @license MIT
 */

// Send initial state to content script
chrome.storage.local.get(['ttvAdblockEnabled'], function (result) {
    const enabled = result.ttvAdblockEnabled !== false;
    window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled } }));
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled: message.enabled } }));
        sendResponse({ success: true });
    }
});

// Listen for storage changes (in case toggle happens from another tab)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.ttvAdblockEnabled) {
        const enabled = changes.ttvAdblockEnabled.newValue !== false;
        window.dispatchEvent(new CustomEvent('ttvab-toggle', { detail: { enabled } }));
    }
});
