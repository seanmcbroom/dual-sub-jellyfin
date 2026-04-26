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

# Or just concatenate (quick dev option)
cat src/parser.js src/content.js > src/content.bundle.js
```

The manifest already points to `content.bundle.js`.

---

## How it works

1. **Detection** — `content.js` checks for Jellyfin-specific DOM markers on page load.
   If found, it watches for a `<video>` element (Jellyfin is a SPA).

2. **Track discovery** — The content script reads the item ID from the URL, calls
   `/Items/{id}/PlaybackInfo` using the token Jellyfin stores in `localStorage`,
   and gets the subtitle stream list.

3. **Fetching** — Subtitle files are fetched by the background service worker
   (avoids CORS) and cached in memory (up to 50 entries, LRU eviction).

4. **Parsing** — `parser.js` converts SRT / VTT / ASS text into a sorted array of
   `{ start, end, text }` objects. A binary search finds the active cue each frame.

5. **Rendering** — A `<div>` overlay is injected over the video element. Subtitle
   text lives in real `<span>` DOM nodes — this is what lets Yomitan scan them.
   The loop runs at ≤60 fps but only touches the DOM when the cue changes.

6. **Offset** — Per-track millisecond offsets are applied in the render loop by
   shifting the playback clock before the cue lookup. Positive = subs appear later.

7. **In-page panel** — The extension also injects a settings panel directly into
   Jellyfin's subtitle settings flyout (the same place you pick native subtitle
   tracks). No need to open the toolbar popup for everyday use.

8. **Settings sync** — Changes made in the in-page panel are broadcast to the popup
   (if open) and vice versa, so they always stay in sync.

---

## Planned improvements

- [ ] External subtitle file upload (drag and drop)
- [ ] OpenSubtitles search integration
- [ ] Per-item subtitle memory (remembers which tracks you used last time)
- [ ] Subtitle search / jump to line
- [ ] Anki export integration
- [ ] Furigana rendering for Japanese
