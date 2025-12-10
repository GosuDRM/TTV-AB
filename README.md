# TTV AB

![Version](https://img.shields.io/badge/version-3.0.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight Chromium-based browser extension that blocks ads on Twitch.tv streams.

![Extension Icon](assets/icons/icon128.png)

## Features

- ✅ Blocks preroll and midroll ads
- ✅ No purple screen errors
- ✅ Works with all stream qualities
- ✅ Manifest V3 compatible
- ✅ Simple enable/disable toggle
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

## Files

```
TTV AB/
├── manifest.json           # Extension configuration
├── README.md               # Documentation
├── LICENSE                 # MIT License
├── CHANGELOG.md            # Version history
├── .gitignore              # Git ignore rules
├── src/
│   ├── scripts/
│   │   └── content.js      # Ad-blocking logic
│   └── popup/
│       ├── popup.html      # Extension popup UI
│       └── popup.js        # Toggle & donate functionality
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

## Author

**GosuDRM**
- GitHub: [@GosuDRM](https://github.com/GosuDRM)
- Email: gianpacayra@gmail.com

## Support

If you find this extension useful, consider supporting the developer:

[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/GosuDRM)

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.

Feel free to modify and use, but please credit the original author.