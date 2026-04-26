// background.js
// Service worker. Handles cross-origin subtitle fetches (avoids CORS issues
// in content scripts) and keeps a small in-memory cache.

const subtitleCache = new Map();

const DEFAULT_SETTINGS = {
  enabled:              true,
  primaryLang:          "",
  secondaryLang:        "",
  defaultPrimaryLang:   "",
  defaultSecondaryLang: "",
  primaryOffset:        0,
  secondaryOffset:      0,
  primarySize:          22,
  secondarySize:        16,
  primaryColor:         "#ffffff",
  secondaryColor:       "#cccccc",
  bgOpacity:            0.6,
  hideOriginal:         true,
  firstOnPause:         false,
  secondaryOnPause:     true,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_SUBTITLE") {
    fetchSubtitle(message.url, message.token)
      .then(text  => sendResponse({ ok: true, text }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "GET_SETTINGS") {
    // Merge stored values over defaults so new keys always have a value
    chrome.storage.sync.get(DEFAULT_SETTINGS, stored => {
      sendResponse({ ...DEFAULT_SETTINGS, ...stored });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.sync.set(message.settings, () => sendResponse({ ok: true }));
    return true;
  }
});

async function fetchSubtitle(url, token) {
  if (subtitleCache.has(url)) return subtitleCache.get(url);

  const headers = token
    ? { Authorization: `MediaBrowser Token="${token}"` }
    : {};

  const response = await fetch(url, { headers });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await response.text();

  subtitleCache.set(url, text);

  // Keep cache from growing unbounded
  if (subtitleCache.size > 50) {
    subtitleCache.delete(subtitleCache.keys().next().value);
  }

  return text;
}
