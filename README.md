# Jellyfin Dual Subtitles

A browser extension that renders two subtitle tracks simultaneously on Jellyfin,
with selectable text so dictionary extensions like Yomitan can scan words.

**Features:**
- Auto-match selected languages
- Subtitle offset
- Broad format support (SRT/VTT/ASS)
- Customisable appearance
- Hide tracks until paused.

---

## Project structure

```
dual-sub-jellyfin/
├── manifests/
│   ├── manifest.chrome.json   ← Chrome / Edge manifest
│   └── manifest.firefox.json  ← Firefox manifest
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── index.js           ← Service worker: subtitle fetching, settings storage
│   ├── content/
│   │   ├── index.js           ← Page script: player hook, overlay, render loop
│   │   ├── parser.js          ← SRT / VTT / ASS → cue objects
│   │   └── overlay.css        ← Subtitle overlay styles
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js           ← Toolbar popup logic
├── tests/
│   └── parser.test.js         ← Unit tests for the parser
├── scripts/
│   └── build.js               ← esbuild-based build script
└── .github/
    └── workflows/
        └── ci.yml             ← GitHub Actions: test → build → zip
```

---

## Development

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

### Build

```bash
# Both browsers
npm run build:all

# Single browser
npm run build:chrome
npm run build:firefox
```

Built extensions are output to `dist/chrome/` and `dist/firefox/`.

### Package ZIPs for distribution

```bash
npm run zip:all
# → releases/dual-sub-jellyfin-chrome.zip
# → releases/dual-sub-jellyfin-firefox.zip
```

---

## Loading the extension

### Chrome / Edge

1. Run `npm run build:chrome`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select `dist/chrome/`

### Firefox

1. Run `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and select `dist/firefox/manifest.json`