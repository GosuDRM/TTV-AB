/**
 * TTV AB - Background Service Worker
 * Handles Cross-Origin requests that are blocked in content scripts
 */

// Listen for messages from content scripts (bridge.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'fetch-proxy') {
        const { url, requestId } = message.detail;

        fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        })
            .then(res => {
                if (res.ok) return res.text();
                throw new Error('Status: ' + res.status);
            })
            .then(text => {
                sendResponse({ success: true, data: text });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.message });
            });

        return true; // Keep channel open for async response
    }
});
