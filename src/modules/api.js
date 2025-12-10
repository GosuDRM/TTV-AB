/**
 * TTV AB - API Module
 * Twitch GraphQL API interactions
 * @private
 */
async function _gqlReq(body) {
    const h = { 'Client-Id': ClientID, 'Content-Type': 'application/json' };
    if (GQLDeviceID) h['X-Device-Id'] = GQLDeviceID;
    if (ClientVersion) h['Client-Version'] = ClientVersion;
    if (ClientSession) h['Client-Session-Id'] = ClientSession;
    if (ClientIntegrityHeader) h['Client-Integrity'] = ClientIntegrityHeader;
    if (AuthorizationHeader) h['Authorization'] = AuthorizationHeader;
    return fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: h, body: JSON.stringify(body) });
}

async function _getToken(channel, type) {
    return _gqlReq({
        operationName: 'PlaybackAccessToken_Template',
        query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
        variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: type }
    });
}
