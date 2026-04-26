# Jellyfin Dual Subtitles

A browser extension that renders two subtitle tracks simultaneously on Jellyfin,
with selectable text so dictionary extensions like Yomitan and Migaku can scan words.

---

## Project structure

```
dual-sub-jellyfin/
├── manifest.json          ← Extension config (permissions, entry points)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      ← Service worker: subtitle fetching, settings storage
    ├── content.js         ← Page script: player hook, overlay, in-page panel
    ├── parser.js          ← SRT / VTT / ASS → cue objects
    ├── overlay.css        ← Subtitle overlay + in-page panel styles
    ├── popup.html         ← Toolbar popup UI
    ├── popup.css          ← Popup styles
    └── popup.js           ← Popup logic
```

---

## How to load the extension

### Chrome / Edge
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dual-sub-jellyfin` folder

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** and select `manifest.json`

---

## Build step (required)

Content scripts can't use ES `import`, so `parser.js` must be bundled into `content.js`:

```bash
# esbuild (recommended)
npm install -g esbuild
esbuild src/content.js --bundle --outfile=src/content.bundle.js

# Or just concatenate
cat src/parser.js src/content.js > src/content.bundle.js
```

The manifest already points to `content.bundle.js`.