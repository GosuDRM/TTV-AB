# Privacy Policy for TTV AB

**Last Updated:** August 22, 2026

This Privacy Policy explains how TTV AB ("the Extension") handles data while you use Twitch.

## 1. Summary

The developer does not receive your personal data, Twitch activity, extension settings, statistics, or diagnostic logs. The Extension does not use a developer-controlled analytics or telemetry service, sell data, or use data for advertising or user profiling.

The Extension runs on Twitch and necessarily communicates with Twitch services to provide ad blocking, backup playback, quality recovery, and popup channel information. Those Twitch communications are described below.

## 2. Twitch Access and Communications

The Extension has access only to Twitch pages covered by its browser permissions. It inspects and modifies Twitch player requests and video playlists to detect advertisements, keep an ad-free stream playing, and restore normal playback afterward.

To provide those features, the Extension may:

- Request playback access tokens, playlists, and media from Twitch services and Twitch media delivery networks. These requests can include the current channel name or VOD ID, requested player type, browser language, and Twitch-provided authorization, integrity, device, client-version, and session headers already used by the Twitch page.
- Read and temporarily adjust Twitch playback preferences, such as selected video quality and low-latency mode, so they can be restored after automatic player recovery.
- Send simulated ad impression, quartile, and pod-completion events to Twitch when Ad Spoofing is enabled. These events can include Twitch ad identifiers, creative and campaign identifiers, a Twitch-provided ad-reporting token, ad duration and position, and available Twitch session headers. Ad Spoofing is enabled by default and can be disabled in the Extension popup.
- Send a channel login to Twitch while that channel's statistics details are open, so the popup can request its profile image and current live status. The profile image is then loaded from Twitch's image delivery network.

These requests are sent only to Twitch-related HTTPS endpoints for the functions described above. Twitch-provided credentials are kept in memory as needed for playback and are not intentionally saved in extension storage or included in exported diagnostic logs.

## 3. Data Stored on Your Device

The Extension uses browser-local extension storage and bounded entries in Twitch's local site storage. Stored data can include:

- The Ad Blocking enable/disable toggle, plus the Ad Spoofing and Low Quality Fallback settings.
- The selected language and popup theme.
- Local UI data such as welcome/donation reminder dismissal timing and related presentation state.
- The persistent "Ads Blocked" counter and recent daily totals.
- Per-channel statistics, including channel login, first-seen and last-seen times, watch time, ads blocked, measured ad duration, and Time Saved.
- Unlocked achievement identifiers.
- A bounded cache of Twitch channel profile image URLs and fetch times.
- Bounded retry and deduplication records used to prevent local statistics from being lost or counted twice after a tab or background process closes unexpectedly.

Per-channel statistics reveal which Twitch channels were watched, but this data stays on your device and is not sent to the developer. The Extension does not access or store browsing activity outside Twitch.

## 4. Diagnostic Logs

While a Twitch tab is open, the Extension keeps a bounded diagnostic log in that tab's memory. When you explicitly choose **Generate Log**, the Extension collects sanitized diagnostics from a bounded number of open Twitch tabs and saves them as a text file on your device.

The exported file can include Twitch page paths, channel or VOD identifiers, timestamps, Extension settings, ad-cycle and backup-stream state, worker status, and video playback or buffering details. The exporter removes URL query strings and is designed to redact credentials, tokens, session values, sensitive headers, blob identifiers, and oversized values.

Diagnostic logs are never uploaded automatically. After a log is saved, the Extension opens the GitHub Issues page, but you decide whether to attach or share the file. Because a log can still contain channel names and playback details, review it before sharing it publicly.

## 5. External Links and Services

The Extension does not include third-party analytics, tracking, advertising, or data-broker SDKs.

The popup and in-page notices contain links to Twitch, GitHub, and Ko-fi. These pages open only after a related user action. GitHub Issues opens as part of the Generate Log flow after you successfully save a diagnostic log. The Extension does not append locally stored statistics or settings to those links. Once an external page opens, that service's own privacy policy applies.

## 6. Retention and Control

Settings and statistics remain in browser-local storage until they are cleared or the Extension is uninstalled. Daily history, caches, and delivery-safety records are bounded or periodically pruned. Small reminder and pending statistics-delivery records stored under Twitch's site storage can be removed by clearing site data for twitch.tv.

Disabling Ad Spoofing stops future simulated ad-event requests. Clearing the Extension's browser storage removes its saved settings, statistics, achievements, and channel image cache.

## 7. Browser Permissions

The Extension requests:

- **Storage permission** to save the local settings and statistics described above.
- **Twitch host access** to run on Twitch pages and embedded Twitch frames, inspect player requests, block advertisements, and maintain playback.

Information obtained through browser permissions is used only to provide and maintain the Extension features described in this policy.

## 8. Changes to This Policy

This policy may be updated when the Extension's data handling changes. The date at the top identifies the latest revision.

## 9. Contact

If you have questions about this policy, please open an issue on the [GitHub Repository](https://github.com/GosuDRM/TTV-AB).
