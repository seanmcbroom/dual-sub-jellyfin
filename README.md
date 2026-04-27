
<p align="center">
  <img src="https://github.com/seanmcbroom/dual-sub-jellyfin/blob/main/icons/icon128.png?raw=true" width="128" /><br>

  <a href="https://addons.mozilla.org/en-US/firefox/addon/language-learning-w-jellyfin/">
    <img src="https://img.shields.io/badge/Firefox-Add--on-orange?logo=firefox-browser&logoColor=white">
  </a>
  <img src="https://img.shields.io/badge/Chrome-Coming%20Soon-lightgrey?logo=googlechrome"><br>

  <img src="https://img.shields.io/github/license/seanmcbroom/dual-sub-jellyfin">
  <img src="https://img.shields.io/github/stars/seanmcbroom/dual-sub-jellyfin?style=social">
</p>

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

## Preview

<img width="1280" height="800" alt="367834" src="https://github.com/user-attachments/assets/5774dddc-6ca6-4e55-bfb4-016e10a8afc3" />

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
<p align="center">
  <img src="https://github.com/seanmcbroom/dual-sub-jellyfin/blob/main/icons/icon128.png?raw=true" width="128" />
</p>

<!-- <p align="center">
  <a href="FIREFOX_ADDONS_LINK">
    <img src="https://img.shields.io/badge/Firefox-Add--on-orange?logo=firefox-browser&logoColor=white">
  </a>
  <a href="CHROME_WEBSTORE_LINK">
    <img src="https://img.shields.io/badge/Chrome-Install-blue?logo=googlechrome&logoColor=white">
  </a>
</p> -->

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

## Preview

<img width="1280" height="800" alt="367834" src="https://github.com/user-attachments/assets/5774dddc-6ca6-4e55-bfb4-016e10a8afc3" />

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
