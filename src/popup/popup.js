/**
 * TTV AB - Popup Script
 * Handles extension popup UI interactions
 * 
 * @author GosuDRM
 * @license MIT
 */

document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('enableToggle');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // Initialize toggle state from storage
    chrome.storage.local.get(['ttvAdblockEnabled'], function (result) {
        const enabled = result.ttvAdblockEnabled !== false;
        toggle.checked = enabled;
        updateStatus(enabled);
    });

    // Persist toggle state changes and notify content script
    toggle.addEventListener('change', function () {
        const enabled = toggle.checked;
        chrome.storage.local.set({ ttvAdblockEnabled: enabled });
        updateStatus(enabled);

        // Send message to active Twitch tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('twitch.tv')) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle', enabled: enabled })
                    .catch(() => { }); // Ignore errors if bridge isn't ready
            }
        });
    });

    /**
     * Updates the visual status indicator
     * @param {boolean} enabled - Whether ad blocking is enabled
     */
    function updateStatus(enabled) {
        if (enabled) {
            statusDot.classList.remove('disabled');
            statusText.textContent = 'Active';
        } else {
            statusDot.classList.add('disabled');
            statusText.textContent = 'Disabled';
        }
    }

    // Donate button - opens PayPal in new tab
    const donateBtn = document.getElementById('donateBtn');
    if (donateBtn) {
        donateBtn.addEventListener('click', function () {
            window.open('https://paypal.me/GosuDRM', '_blank');
        });
    }

    // Author link - opens GitHub profile
    const authorLink = document.getElementById('authorLink');
    if (authorLink) {
        authorLink.addEventListener('click', function (e) {
            e.preventDefault();
            window.open('https://github.com/GosuDRM', '_blank');
        });
    }
});
