# TTV AB

![Version](https://img.shields.io/badge/version-3.1.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight Chromium-based browser extension that blocks ads on Twitch.tv streams.

🔗 **Repository:** [https://github.com/GosuDRM/TTV-AB](https://github.com/GosuDRM/TTV-AB)

![Extension Icon](assets/icons/icon128.png)

## Features

- ✅ Blocks preroll and midroll ads
- ✅ Blocks anti-adblock popups ("Support streamer by disabling ad block")
- ✅ No purple screen errors
- ✅ Works with all stream qualities
- ✅ Manifest V3 compatible
- ✅ Simple enable/disable toggle
- ✅ Auto-refresh on player crash
- ✅ Persistent "Ads Blocked" & "Popups Blocked" statistics
- ✅ Modern, animated UI (Cyberpunk/Neon aesthetic)
- ✅ Lightweight and fast

## Usage

1. Navigate to [twitch.tv](https://twitch.tv)
2. Open any live stream
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable

## How It Works

The extension intercepts Twitch's HLS video playlists and:
- Strips ad segments from M3U8 playlists
- Fetches backup ad-free streams when ads are detected
- Caches ad segments to prevent playback

## Author

**GosuDRM**
- GitHub: [@GosuDRM](https://github.com/GosuDRM)
- Email: gianpacayra@gmail.com

## Support

If you find this extension useful, consider supporting the developer:

[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/GosuDRM)

## Privacy
This extension operates entirely locally and does not collect any user data. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.

Feel free to modify and use, but please credit the original author.