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
    const timeSaved = document.getElementById('timeSaved');
    const statsToggle = document.getElementById('statsToggle');
    const statsPanel = document.getElementById('statsPanel');
    const weeklyChart = document.getElementById('weeklyChart');
    const chartAvg = document.getElementById('chartAvg');
    const channelList = document.getElementById('channelList');
    const achievementsGrid = document.getElementById('achievementsGrid');
    const achievementsProgress = document.getElementById('achievementsProgress');
    const nextAchievement = document.getElementById('nextAchievement');

    /** Average ad duration in seconds */
    const AVG_AD_DURATION = 22;

    /** Achievement definitions (must match constants.js) */
    const ACHIEVEMENTS = [
        { id: 'first_block', name: 'Ad Slayer', icon: '⚔️', threshold: 1, type: 'ads' },
        { id: 'block_10', name: 'Blocker', icon: '🛡️', threshold: 10, type: 'ads' },
        { id: 'block_100', name: 'Guardian', icon: '🔰', threshold: 100, type: 'ads' },
        { id: 'block_500', name: 'Sentinel', icon: '🏰', threshold: 500, type: 'ads' },
        { id: 'block_1000', name: 'Legend', icon: '🏆', threshold: 1000, type: 'ads' },
        { id: 'block_5000', name: 'Mythic', icon: '👑', threshold: 5000, type: 'ads' },
        { id: 'popup_10', name: 'Popup Crusher', icon: '💥', threshold: 10, type: 'popups' },
        { id: 'popup_50', name: 'Popup Destroyer', icon: '🔥', threshold: 50, type: 'popups' },
        { id: 'time_1h', name: 'Hour Saver', icon: '⏱️', threshold: 3600, type: 'time' },
        { id: 'time_10h', name: 'Time Master', icon: '⏰', threshold: 36000, type: 'time' },
        { id: 'channels_5', name: 'Explorer', icon: '📺', threshold: 5, type: 'channels' },
        { id: 'channels_20', name: 'Adventurer', icon: '🌍', threshold: 20, type: 'channels' }
    ];

    /**
     * Format time saved as human-readable string
     * @param {number} seconds - Total seconds saved
     * @returns {string} Formatted time string
     */
    function formatTimeSaved(seconds) {
        if (seconds < 60) return `~${seconds}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) return `~${hours}h ${minutes}m`;
        return `~${minutes}m ${secs}s`;
    }

    /**
     * Update time saved display
     * @param {number} adsCount - Number of ads blocked
     */
    function updateTimeSaved(adsCount) {
        const seconds = adsCount * AVG_AD_DURATION;
        timeSaved.textContent = formatTimeSaved(seconds);
    }

    /**
     * Get last 7 days date keys
     * @returns {string[]} Array of date strings
     */
    function getLast7Days() {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().split('T')[0]);
        }
        return days;
    }

    /**
     * Render weekly chart
     * @param {Object} dailyData - Daily stats object
     */
    function renderChart(dailyData) {
        const days = getLast7Days();
        const values = days.map(d => (dailyData[d]?.ads || 0) + (dailyData[d]?.popups || 0));
        const max = Math.max(...values, 1);
        const avg = Math.round(values.reduce((a, b) => a + b, 0) / 7);

        weeklyChart.innerHTML = values.map((v, i) => {
            const height = Math.max((v / max) * 100, 8);
            const dayName = new Date(days[i]).toLocaleDateString('en', { weekday: 'short' });
            return `<div class="chart-bar" style="height: ${height}%;" title="${dayName}: ${v} blocked"></div>`;
        }).join('');

        chartAvg.textContent = `avg: ${avg}/day`;
    }

    /**
     * Escape HTML entities to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Render top channels list
     * @param {Object} channelsData - Channels stats object
     */
    function renderChannels(channelsData) {
        const entries = Object.entries(channelsData || {});
        if (entries.length === 0) {
            channelList.innerHTML = `
                <div class="channel-item">
                    <span><span class="channel-rank">-</span><span class="channel-name">No data yet</span></span>
                    <span class="channel-count">-</span>
                </div>
            `;
            return;
        }

        entries.sort((a, b) => b[1] - a[1]);
        const top5 = entries.slice(0, 5);

        channelList.innerHTML = top5.map((entry, i) => `
            <div class="channel-item">
                <span><span class="channel-rank">${i + 1}.</span><span class="channel-name">${escapeHtml(entry[0])}</span></span>
                <span class="channel-count">${entry[1].toLocaleString()}</span>
            </div>
        `).join('');
    }

    /**
     * Render achievements badges
     * @param {string[]} unlocked - Array of unlocked achievement IDs
     * @param {number} adsBlocked - Total ads blocked
     * @param {number} popupsBlocked - Total popups blocked
     * @param {number} channelCount - Number of unique channels
     */
    function renderAchievements(unlocked, adsBlocked, popupsBlocked, channelCount) {
        const badges = achievementsGrid.querySelectorAll('.achievement-badge');
        const timeSavedSecs = adsBlocked * AVG_AD_DURATION;
        let unlockedCount = 0;
        let nextAch = null;

        ACHIEVEMENTS.forEach((ach, i) => {
            const isUnlocked = unlocked.includes(ach.id);
            if (isUnlocked) {
                badges[i].classList.add('unlocked');
                unlockedCount++;
            } else {
                badges[i].classList.remove('unlocked');
                if (!nextAch) {
                    // Find next achievement to unlock
                    let value = 0;
                    switch (ach.type) {
                        case 'ads': value = adsBlocked; break;
                        case 'popups': value = popupsBlocked; break;
                        case 'time': value = timeSavedSecs; break;
                        case 'channels': value = channelCount; break;
                    }
                    if (value < ach.threshold) {
                        nextAch = ach;
                    }
                }
            }
        });

        achievementsProgress.textContent = `${unlockedCount}/12`;

        if (nextAch) {
            nextAchievement.innerHTML = `Next: <span class="next-achievement-name">${nextAch.icon} ${nextAch.name}</span>`;
        } else {
            nextAchievement.innerHTML = `<span class="next-achievement-name">🎉 All unlocked!</span>`;
        }
    }

    /**
     * Load and render all statistics
     */
    function loadStatistics() {
        chrome.storage.local.get(['ttvStats', 'ttvAdsBlocked', 'ttvPopupsBlocked'], function (result) {
            const stats = result.ttvStats || { daily: {}, channels: {}, achievements: [] };
            const adsCount = result.ttvAdsBlocked || 0;
            const popupsCount = result.ttvPopupsBlocked || 0;
            const channelCount = Object.keys(stats.channels || {}).length;

            renderChart(stats.daily || {});
            renderChannels(stats.channels);
            renderAchievements(stats.achievements || [], adsCount, popupsCount, channelCount);
        });
    }

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
        updateTimeSaved(adsCount);
    });

    // Load statistics on popup open
    loadStatistics();

    // Listen for real-time counter updates
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (namespace === 'local') {
            if (changes.ttvAdsBlocked) {
                const newCount = changes.ttvAdsBlocked.newValue || 0;
                animateCounter(adsBlockedCount, newCount);
                updateTimeSaved(newCount);
            }
            if (changes.ttvPopupsBlocked) {
                const newPopupsCount = changes.ttvPopupsBlocked.newValue || 0;
                animateCounter(popupsBlockedCount, newPopupsCount);
            }
            if (changes.ttvStats) {
                loadStatistics();
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

    // Stats panel toggle
    statsToggle.addEventListener('click', function () {
        statsToggle.classList.toggle('expanded');
        statsPanel.classList.toggle('expanded');
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

