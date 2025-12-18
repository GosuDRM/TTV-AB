/**
 * TTV AB - API Module
 * Twitch GraphQL API interactions
 * @module api
 * @private
 */

/** @type {string} GraphQL endpoint */
const _GQL_URL = 'https://gql.twitch.tv/gql';

/**
 * Get stream playback access token
 * @param {string} channel - Channel name
 * @param {string} playerType - Player type
 * @returns {Promise<Response>} Token response
 */
async function _getToken(channel, playerType, realFetch) {
    const fetchFunc = realFetch || fetch;
    const reqPlayerType = playerType;

    const body = {
        operationName: 'PlaybackAccessToken',
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: __TTVAB_STATE__.PlaybackAccessTokenHash || 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9'
            }
        },
        variables: {
            isLive: true,
            login: channel,
            isVod: false,
            vodID: '',
            playerType: reqPlayerType,
            platform: reqPlayerType === 'autoplay' ? 'android' : 'web'
        }
    };

    try {
        _log(`[Trace] Requesting token for ${playerType} (req=${reqPlayerType})`, 'info');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const headers = {
            'Client-ID': _C.CLIENT_ID,
            'Client-Integrity': __TTVAB_STATE__.ClientIntegrityHeader || '',
            'X-Device-Id': __TTVAB_STATE__.GQLDeviceID || 'oauth',
            'Client-Version': __TTVAB_STATE__.ClientVersion || 'k8s-v1'
        };

        // Only include Authorization header if set (avoid undefined in headers)
        if (__TTVAB_STATE__.AuthorizationHeader) {
            headers['Authorization'] = __TTVAB_STATE__.AuthorizationHeader;
        }

        const res = await fetchFunc(_GQL_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        _log(`[Trace] Token response for ${playerType}: ${res.status}`, 'info');
        return res;
    } catch (e) {
        _log(`Token fetch error for ${playerType}: ${e.message}`, 'error');
        return { status: 0, json: () => Promise.resolve({}) };
    }
}
