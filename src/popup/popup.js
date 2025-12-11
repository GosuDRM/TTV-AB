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
    const adsBlockedCount = document.getElementById('adsBlockedCount');
    const popupsBlockedCount = document.getElementById('popupsBlockedCount');

    // Initialize toggle state and counters from storage
    chrome.storage.local.get(['ttvAdblockEnabled', 'ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
        const enabled = result.ttvAdblockEnabled !== false;
        toggle.checked = enabled;
        updateStatus(enabled);

        // Initialize counters
        const adsCount = result.ttvAdsBlocked || 0;
        const popupsCount = result.ttvPopupsBlocked || 0;
        adsBlockedCount.textContent = formatNumber(adsCount);
        popupsBlockedCount.textContent = formatNumber(popupsCount);
    });

    // Listen for real-time counter updates
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (namespace === 'local') {
            if (changes.ttvAdsBlocked) {
                const newCount = changes.ttvAdsBlocked.newValue || 0;
                animateCounter(adsBlockedCount, newCount);
            }
            if (changes.ttvPopupsBlocked) {
                const newPopupsCount = changes.ttvPopupsBlocked.newValue || 0;
                animateCounter(popupsBlockedCount, newPopupsCount);
            }
        }
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
                    .catch((err) => {
                        // Bridge may not be ready yet, this is expected on non-stream pages
                        console.debug('TTV AB: Toggle message not delivered -', err.message);
                    });
            }
        });
    });

    // Timeout reference for status message reset
    let statusTimeout = null;

    /**
     * Updates the visual status indicator and dynamic message
     * @param {boolean} enabled - Whether ad blocking is enabled
     */
    function updateStatus(enabled) {
        const info = document.querySelector('.info');

        if (enabled) {
            statusDot.classList.remove('disabled');
            statusText.textContent = 'Active';
            info.textContent = 'Ad blocking ENABLED';
            info.style.color = '#4CAF50';
        } else {
            statusDot.classList.add('disabled');
            statusText.textContent = 'Disabled';
            info.textContent = 'Ad blocking DISABLED';
            info.style.color = '#f44336';
        }

        // Reset message after 1.5s
        info.style.transition = 'color 0.3s ease';
        if (statusTimeout) clearTimeout(statusTimeout);
        statusTimeout = setTimeout(() => {
            info.textContent = 'Changes take effect instantly';
            info.style.color = '#666';
        }, 1500);
    }

    /**
     * Formats number with locale-specific separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    function formatNumber(num) {
        return num.toLocaleString();
    }

    /**
     * Animates the counter update with a subtle pulse
     * @param {HTMLElement} element - Counter element
     * @param {number} newValue - New count value
     */
    function animateCounter(element, newValue) {
        element.textContent = formatNumber(newValue);
        element.classList.add('pulse');
        setTimeout(() => element.classList.remove('pulse'), 200);
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
