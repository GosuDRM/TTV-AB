import globals from "globals";

export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: "readonly",
                // Content script globals
                _C: "readonly",
                _S: "readonly",
                _log: "readonly",
                _ATTR_REGEX: "readonly",
                // State variables
                StreamInfos: "writable",
                StreamInfosByUrl: "writable",
                AdSignifier: "writable",
                ClientID: "writable",
                GQLDeviceID: "writable",
                ClientVersion: "writable",
                ClientSession: "writable",
                ClientIntegrityHeader: "writable",
                AuthorizationHeader: "writable",
                BackupPlayerTypes: "writable",
                FallbackPlayerType: "writable",
                ForceAccessTokenPlayerType: "writable",
                IsAdStrippingEnabled: "writable",
                AdSegmentCache: "writable",
                V2API: "writable",
                HasTriggeredPlayerReload: "writable",
                PlayerReloadMinimalRequestsTime: "writable",
                PlayerReloadMinimalRequestsPlayerIndex: "writable",
                SimulatedAdsDepth: "writable",
                SkipPlayerReloadOnHevc: "writable",
                AlwaysReloadPlayerOnAd: "writable",
                AllSegmentsAreAdSegments: "writable",
                // Functions defined in other modules
                _declareState: "readonly",
                _incrementAdsBlocked: "readonly",
                _parseAttrs: "readonly",
                _getServerTime: "readonly",
                _replaceServerTime: "readonly",
                _stripAds: "readonly",
                _getStreamUrl: "readonly",
                _gqlReq: "readonly",
                _getToken: "readonly",
                _processM3U8: "readonly",
                _getWasmJs: "readonly",
                _hookWorkerFetch: "readonly",
                _hookWorker: "readonly",
                _hookStorage: "readonly",
                _hookMainFetch: "readonly",
                _initToggleListener: "readonly",
                _initCrashMonitor: "readonly",
                _blockAntiAdblockPopup: "readonly",
                _initAchievementListener: "readonly",
                _showWelcome: "readonly",
                _showDonation: "readonly",
                _bootstrap: "readonly",
                _init: "readonly",
                _cleanWorker: "readonly",
                _getReinsert: "readonly",
                _reinsert: "readonly",
                _isValid: "readonly",
                _GQL_URL: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
            "semi": ["warn", "always"],
            "eqeqeq": ["warn", "always"],
            "curly": ["warn", "multi-line"],
            "no-var": "warn",
            "prefer-const": "warn"
        }
    },
    {
        ignores: ["node_modules/**", "dist/**", "src/scripts/content.js"]
    }
];
