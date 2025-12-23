// TTV AB - ESLint Config
import globals from "globals";
import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: "readonly",
                fetch: "writable",
                __TTVAB_STATE__: "writable",
                _C: "readonly",
                _S: "readonly",
                _log: "readonly",
                _ATTR_REGEX: "readonly",
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
                _GQL_URL: "readonly",
                _findBackupStream: "readonly",
                _doPlayerTask: "readonly",
                _getPlayerAndState: "readonly",
                _monitorPlayerBuffering: "readonly",
                _hookVisibilityState: "readonly",
                _hookLocalStoragePreservation: "readonly",
                ReloadPlayerAfterAd: "writable",
                TRANSLATIONS: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-redeclare": "off",
            "no-console": "off",
            "no-empty": ["error", { "allowEmptyCatch": true }],
            "semi": ["warn", "always"],
            "eqeqeq": ["warn", "always"],
            "curly": ["warn", "multi-line"],
            "no-var": "warn",
            "prefer-const": "warn"
        }
    },
    {
        files: ["build.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node
            }
        }
    },
    {
        ignores: ["node_modules/**", "dist/**", "src/scripts/content.js"]
    }
];
