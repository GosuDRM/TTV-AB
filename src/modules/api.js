/**
 * TTV AB - API Module
 * Twitch GraphQL API interactions
 * @module api
 * @private
 */

/** @type {string} GraphQL endpoint */
const _GQL_URL = 'https://gql.twitch.tv/gql';

/**
 * Make a GraphQL request to Twitch API
 * @param {Object} body - Request body
 * @returns {Promise<Response>} Fetch response
 */
function _gqlReq(body) {
    const headers = {
        'Content-Type': 'application/json',
        'Client-ID': ClientID
    };
    if (GQLDeviceID) headers['X-Device-Id'] = GQLDeviceID;
    if (ClientVersion) headers['Client-Version'] = ClientVersion;
    if (ClientSession) headers['Client-Session-Id'] = ClientSession;
    if (ClientIntegrityHeader) headers['Client-Integrity'] = ClientIntegrityHeader;
    if (AuthorizationHeader) headers['Authorization'] = AuthorizationHeader;

    return fetch(_GQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    }).then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res;
    });
}

/**
 * Get stream playback access token
 * @param {string} channel - Channel name
 * @param {string} playerType - Player type
 * @returns {Promise<Response>} Token response
 */
function _getToken(channel, playerType) {
    return _gqlReq({
        operationName: 'PlaybackAccessToken',
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712'
            }
        },
        variables: {
            isLive: true,
            login: channel,
            isVod: false,
            vodID: '',
            playerType
        }
    });
}
