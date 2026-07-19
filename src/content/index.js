// src/content/index.js
// Injected into every page. Detects Jellyfin, hooks the video player,
// creates the subtitle overlay, and drives the render loop.

const { parseSubtitles, findCue } = require("./parser");
const panelTemplate = require("../shared/panel-template");
const { panelHeaderTemplate } = panelTemplate;
const mountPanel = require("../shared/panel-controller");
const ICONS = require("../shared/icons");
const { parseIchiHtml } = require("./ichi-parser");
const { showTooltip, hideTooltip } = require("./ichi-tooltip");

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  video: null,
  overlay: null,
  primaryLine: null,
  secondaryLine: null,
  primaryCues: [],
  secondaryCues: [],
  settings: null,
  animFrameId: null,
  jellyfinApiBase: null,
  jellyfinToken: null,
  lastPausedPrimaryCue: null,
  lastPausedSecondaryCue: null,
  isPrimaryHovered: false,
  isSecondaryHovered: false,
  toggleBtn: null,
  panelEl: null,
  panelController: null,
  controlBarObserver: null
};

let lastFetchedTracks = [];

// ── Boot ──────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "REQUEST_TRACKS") {
    chrome.runtime.sendMessage({
      type: "TRACKS_AVAILABLE",
      tracks: lastFetchedTracks || []
    });
  }
});

init();

function init() {
  if (!isJellyfinPage()) {
    return;
  }

  loadSettings().then(settings => {
    state.settings = settings;

    observeNavigation();
    observeControlBar();

    if (settings.enabled) {
      waitForVideo();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED") {
      const wasEnabled = state.settings?.enabled;
      const prevPrimaryOffset = state.settings?.primaryOffset;
      const prevSecondaryOffset = state.settings?.secondaryOffset;

      state.settings = message.settings;

      applySettingsToOverlay();
      updateNativeSubtitlesSuppression();
      updatePrimaryVisibility();
      updateSecondaryVisibility();

      if (wasEnabled !== message.settings.enabled) {
        handleEnabledChange(message.settings.enabled);
      }
      if (prevPrimaryOffset !== message.settings.primaryOffset) {
        reapplyOffset("primary");
      }
      if (prevSecondaryOffset !== message.settings.secondaryOffset) {
        reapplyOffset("secondary");
      }

      if (state.panelController) {
        state.panelController.setSettings(state.settings);
      }
    }
  });
}

// Turns subtitle rendering on/off at runtime without a full page reload.
// The in-player button and panel stay mounted either way, so the person
// always has a way to flip it back on from the player.
function handleEnabledChange(enabled) {
  if (enabled) {
    if (!state.video) waitForVideo();
  } else {
    teardown();
  }
}

// ── Jellyfin detection ────────────────────────────────────────────────────────

function isJellyfinPage() {
  const result =
    document.querySelector('meta[name="application-name"][content="Jellyfin"]') !== null ||
    document.querySelector("#jellyfin-metro-js") !== null ||
    window.__jellyfin !== undefined;

  return result;
}

// ── Video detection ───────────────────────────────────────────────────────────

function waitForVideo() {
  const existing = document.querySelector("video");
  if (existing) {
    onVideoFound(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const video = document.querySelector("video");
    if (video) {
      observer.disconnect();
      onVideoFound(video);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function observeNavigation() {
  let lastHref = location.href;

  function handleNavigation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    teardown();
    removeToggleButton();
    hidePanel();
    if (state.settings?.enabled) waitForVideo();
  }

  window.addEventListener("popstate", handleNavigation);

  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(handleNavigation).observe(titleEl, { childList: true });
  }
}

async function onVideoFound(video) {
  state.video = video;
  lastFetchedTracks = [];

  detectJellyfinCredentials();

  createOverlay();

  function updateVisibilities() {
    updatePrimaryVisibility();
    updateSecondaryVisibility();
  }
  state.video.addEventListener("play", updateVisibilities);
  state.video.addEventListener("pause", updateVisibilities);
  updateVisibilities();

  updateNativeSubtitlesSuppression();

  injectToggleButton();
  hideTooltip();

  const tracks = await fetchSubtitleTracks();
  lastFetchedTracks = tracks;
  chrome.runtime.sendMessage({ type: "TRACKS_AVAILABLE", tracks });
  if (state.panelController) state.panelController.setTracks(tracks);

  let primaryTrack = tracks.find(t => t.label === state.settings.primaryLang);
  if (primaryTrack) {
    await loadTrack("primary", primaryTrack.url);
  } else {
    primaryTrack = tracks.find(t => t.label.toLowerCase().includes(state.settings.defaultPrimaryLang.toLowerCase()));
    if (primaryTrack) {
      await loadTrack("primary", primaryTrack.url);
      state.settings.primaryLang = primaryTrack.label;
    }
  }

  let secondaryTrack = tracks.find(t => t.label === state.settings.secondaryLang);
  if (secondaryTrack) {
    await loadTrack("secondary", secondaryTrack.url);
  } else {
    secondaryTrack = tracks.find(t => t.label.toLowerCase().includes(state.settings.defaultSecondaryLang.toLowerCase()));
    if (secondaryTrack) {
      await loadTrack("secondary", secondaryTrack.url);
      state.settings.secondaryLang = secondaryTrack.label;
    }
  }

  if (state.panelController) state.panelController.setSettings(state.settings);

  startRenderLoop();
}

function teardown() {
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
  if (state.overlay) state.overlay.remove();

  const existing = document.getElementById("jf-hide-native-subs-style");
  if (existing) existing.remove();

  state = {
    ...state,
    video: null,
    overlay: null,
    primaryLine: null,
    secondaryLine: null,
    primaryCues: [],
    secondaryCues: [],
    animFrameId: null,
    lastPausedPrimaryCue: null,
    lastPausedSecondaryCue: null,
    isPrimaryHovered: false,
    isSecondaryHovered: false
  };
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function createOverlay() {
  if (!state.video) {
    return;
  }

  if (document.getElementById("jf-dual-subs-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "jf-dual-subs-overlay";

  // IMPORTANT: force top layer above everything
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "10%";
  overlay.style.zIndex = "2147483647";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.gap = "6px";
  overlay.style.pointerEvents = "none";

  const primary = document.createElement("div");
  primary.className = "jf-sub-line jf-sub-primary";
  primary.style.pointerEvents = "auto";

  const secondary = document.createElement("div");
  secondary.className = "jf-sub-line jf-sub-secondary";
  secondary.style.pointerEvents = "auto";

  // Performance-friendly event-driven hover state tracking
  primary.addEventListener("mouseenter", () => { state.isPrimaryHovered = true; });
  primary.addEventListener("mouseleave", () => { state.isPrimaryHovered = false; });
  secondary.addEventListener("mouseenter", () => { state.isSecondaryHovered = true; });
  secondary.addEventListener("mouseleave", () => { state.isSecondaryHovered = false; });

  overlay.appendChild(primary);
  overlay.appendChild(secondary);

  document.body.appendChild(overlay);

  state.overlay = overlay;
  state.primaryLine = primary;
  state.secondaryLine = secondary;

  applySettingsToOverlay();
}

function updatePrimaryVisibility() {
  if (!state.video || !state.primaryLine) return;

  const paused = state.video.paused;

  if (state.settings.firstOnPause && !paused) {
    state.primaryLine.style.display = "none";
  } else {
    state.primaryLine.style.display = "";
  }
}

function updateSecondaryVisibility() {
  if (!state.video || !state.secondaryLine) return;

  const paused = state.video.paused;

  if (state.settings.secondaryOnPause && !paused) {
    state.secondaryLine.style.display = "none";
  } else {
    state.secondaryLine.style.display = "";
  }
}

function applySettingsToOverlay() {
  if (!state.primaryLine || !state.secondaryLine) {
    return;
  }

  const s = state.settings || {};

  state.primaryLine.style.fontSize = `${s.primarySize || 22}px`;
  state.primaryLine.style.color = s.primaryColor || "#ffffff";

  state.secondaryLine.style.fontSize = `${s.secondarySize || 16}px`;
  state.secondaryLine.style.color = s.secondaryColor || "#cccccc";

  if (state.overlay) {
    state.overlay.style.setProperty("--sub-bg-opacity", s.bgOpacity ?? 0.6);
  }
}

function updateNativeSubtitlesSuppression() {
  const existing = document.getElementById("jf-hide-native-subs-style");

  if (state.settings && state.settings.hideOriginal && state.settings.enabled) {
    if (!existing) {
      const style = document.createElement("style");
      style.id = "jf-hide-native-subs-style";
      style.textContent = `
        .videoSubtitles,
        .videoSubtitlesInner,
        .subtitles-container,
        .htmlvideoplayer-subtitles,
        .subtitleContainer,
        video::cue {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
        .btnSubtitles {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    if (existing) {
      existing.remove();
    }
  }
}

// ── In-player button + panel ─────────────────────────────────────────────────
// Mounts a button next to Jellyfin's own CC ("Subtitles") button that opens
// the same settings panel as the toolbar popup, docked above the player
// controls instead of hanging off the browser toolbar.

function observeControlBar() {
  if (state.controlBarObserver) return;

  const observer = new MutationObserver(() => {
    if (!document.getElementById("jf-dual-subs-toggle-btn")) {
      injectToggleButton();
    }
    if (state.panelEl && !document.body.contains(state.panelEl)) {
      state.panelEl = null;
      state.panelController = null;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  state.controlBarObserver = observer;
}

function findCcButton() {
  return (
    document.querySelector(".btnSubtitles") ||
    document.querySelector('button[title="Subtitles"]') ||
    document.querySelector('button[data-id="btnSubtitles"]')
  );
}

function injectToggleButton() {
  if (document.getElementById("jf-dual-subs-toggle-btn")) return;

  const ccBtn = findCcButton();
  if (!ccBtn) return;

  // Clone Jellyfin's button so we inherit its styling.
  const btn = ccBtn.cloneNode(true);
  btn.id = "jf-dual-subs-toggle-btn";
  btn.classList.add("jf-dual-subs-btn");
  btn.classList.remove("btnSubtitles");
  btn.removeAttribute("data-id");
  btn.setAttribute("title", "Dual Subtitles");
  btn.setAttribute("aria-label", "Dual Subtitles");

  const iconHolder = btn.querySelector(".xlargePaperIconButton");

  if (iconHolder) {
    iconHolder.className = "xlargePaperIconButton";

    iconHolder.innerHTML = `
      <span class="jf-dual-subs-icon">
        ${ICONS.dualSubs}
      </span>
    `;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel(btn);
  });

  ccBtn.insertAdjacentElement("afterend", btn);
  state.toggleBtn = btn;
}

function removeToggleButton() {
  const btn = document.getElementById("jf-dual-subs-toggle-btn");
  if (btn) btn.remove();
  state.toggleBtn = null;
}

function buildContentHost() {
  return {
    updateSetting(key, value, { broadcast = true, silent = false } = {}) {
      if (!state.settings || state.settings[key] === value) return;

      state.settings[key] = value;

      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: state.settings });

      applySettingsToOverlay();
      updateNativeSubtitlesSuppression();
      updatePrimaryVisibility();
      updateSecondaryVisibility();

      if (key === "enabled") handleEnabledChange(value);
      if (key === "primaryOffset") reapplyOffset("primary");
      if (key === "secondaryOffset") reapplyOffset("secondary");

      if (broadcast) {
        chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: state.settings });
      }
      if (!silent && state.panelController) state.panelController.flashSaved();
    },

    onTrackSelect(role, url) {
      loadTrack(role, url);
      chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: state.settings });
    },

    requestTracks() {
      if (state.panelController) state.panelController.setTracks(lastFetchedTracks);
    },

    onClose() {
      hidePanel();
    }
  };
}

function createPanel() {
  const panel = document.createElement("div");
  panel.id = "jf-dual-subs-panel";
  panel.className = "jf-panel-scope jf-floating-panel jf-panel-scroll";

  const header = document.createElement("div");
  header.className = "jf-floating-panel-header";
  header.innerHTML = panelHeaderTemplate({ closable: true });

  const body = document.createElement("div");
  body.innerHTML = panelTemplate();

  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);

  const controller = mountPanel(panel, buildContentHost());
  controller.setSettings(state.settings || {});
  controller.setTracks(lastFetchedTracks);

  state.panelEl = panel;
  state.panelController = controller;

  document.addEventListener("mousedown", handleOutsideClick, true);
  window.addEventListener("resize", positionPanel);

  return panel;
}

function handleOutsideClick(e) {
  if (!state.panelEl) return;

  if (
    state.panelEl.contains(e.target) ||
    state.toggleBtn?.contains(e.target)
  ) {
    return;
  }

  hidePanel();
}

function positionPanel() {
  if (!state.panelEl || !state.toggleBtn) return;

  const btnRect = state.toggleBtn.getBoundingClientRect();
  const panelRect = state.panelEl.getBoundingClientRect();
  const margin = 10;

  let left = btnRect.right - panelRect.width;
  left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));

  let top = btnRect.top - panelRect.height - margin;
  if (top < margin) {
    // Not enough room above the button (e.g. small window) — drop it below instead.
    top = Math.min(btnRect.bottom + margin, window.innerHeight - panelRect.height - margin);
  }

  state.panelEl.style.left = `${left}px`;
  state.panelEl.style.top = `${top}px`;
}

function showPanel() {
  if (!state.panelEl) createPanel();
  state.panelEl.classList.remove("jf-hidden");
  state.toggleBtn?.classList.add("jf-btn-active");
  positionPanel();
}

function hidePanel() {
  if (!state.panelEl) return;
  state.panelEl.classList.add("jf-hidden");
  state.toggleBtn?.classList.remove("jf-btn-active");
}

function togglePanel() {
  if (state.panelEl && !state.panelEl.classList.contains("jf-hidden")) {
    hidePanel();
  } else {
    showPanel();
  }
}

// ── Jellyfin API ──────────────────────────────────────────────────────────────

function detectJellyfinCredentials() {
  try {
    const credStr = localStorage.getItem("jellyfin_credentials");

    if (!credStr) {
      console.warn("[DualSubs][Content] No Jellyfin credentials found");
      return;
    }

    const creds = JSON.parse(credStr);
    const server = creds?.Servers?.[0];

    if (!server) {
      return;
    }

    state.jellyfinApiBase = (
      server.ManualAddress ||
      server.LocalAddress ||
      server.RemoteAddress ||
      ""
    ).replace(/\/$/, "");

    state.jellyfinToken = server.AccessToken;
    state.jellyfinUserId = server.UserId || "";

  } catch (e) {
    console.warn("[DualSubs][Content] Credential parse error:", e);
  }
}

function getItemIdFromFavoriteButton() {
  const btn =
    document.querySelector('button.btnUserRating[data-id]') ||
    document.querySelector('button[is="emby-ratingbutton"][data-id]');

  const id = btn?.dataset?.id;

  if (!id) {
    return null;
  }

  return id;
}

function getJellyfinAuthHeader() {
  return `MediaBrowser Client="Jellyfin Web", Token="${state.jellyfinToken}"`;
}

async function fetchSubtitleTracks() {
  const itemId = getItemIdFromFavoriteButton();

  if (!itemId) {
    return [];
  }

  if (!state.jellyfinApiBase || !state.jellyfinToken) {
    return [];
  }

  try {
    const res = await fetch(
      `${state.jellyfinApiBase}/Items/${itemId}/PlaybackInfo`, {
      method: "POST",
      headers: {
        Authorization: getJellyfinAuthHeader(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({})
    });

    if (!res.ok) return [];

    const data = await res.json();
    const mediaSource = data?.MediaSources?.[0];

    if (!mediaSource) {
      return [];
    }

    const tracks = (mediaSource.MediaStreams || [])
      .filter(s => s.Type === "Subtitle")
      .map(s => ({
        index: s.Index,
        label: s.DisplayTitle || s.Language || `Track ${s.Index}`,
        url:
          `${state.jellyfinApiBase}/Videos/${itemId}/${mediaSource.Id}/Subtitles/${s.Index}/Stream.${(s.Codec || "srt").toLowerCase()}`
      }));

    return tracks;
  } catch (e) {
    return [];
  }
}

// ── Track loading ─────────────────────────────────────────────────────────────

function applyOffset(cues, offsetMs) {
  if (!offsetMs) return cues;
  return cues.map(cue => ({
    ...cue,
    start: cue.start + offsetMs,
    end: cue.end + offsetMs
  }));
}

async function loadTrack(role, url) {
  const response = await chrome.runtime.sendMessage({
    type: "FETCH_SUBTITLE",
    url,
    token: state.jellyfinToken
  });

  if (!response?.ok) {
    return;
  }

  const rawCues = parseSubtitles(response.text, url);
  const offsetMs = (role === "primary" ? state.settings?.primaryOffset : state.settings?.secondaryOffset) || 0;

  if (role === "primary") {
    state.primaryCuesRaw = rawCues;
    state.primaryCues = applyOffset(rawCues, offsetMs);
  } else {
    state.secondaryCuesRaw = rawCues;
    state.secondaryCues = applyOffset(rawCues, offsetMs);
  }
}

// Re-derives offset cues from the raw parse without re-fetching. Call
// whenever settings.primaryOffset / settings.secondaryOffset changes.
function reapplyOffset(role) {
  if (role === "primary" && state.primaryCuesRaw) {
    state.primaryCues = applyOffset(state.primaryCuesRaw, state.settings?.primaryOffset || 0);
  } else if (role === "secondary" && state.secondaryCuesRaw) {
    state.secondaryCues = applyOffset(state.secondaryCuesRaw, state.settings?.secondaryOffset || 0);
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function isHoveringSubtitle() {
  return !!(state.isPrimaryHovered || state.isSecondaryHovered);
}

function checkPauseOnHover(timeMs) {
  const primaryCue = findCue(state.primaryCues, timeMs);
  const secondaryCue = findCue(state.secondaryCues, timeMs);

  if (state.lastPausedPrimaryCue !== primaryCue) {
    state.lastPausedPrimaryCue = null;
  }
  if (state.lastPausedSecondaryCue !== secondaryCue) {
    state.lastPausedSecondaryCue = null;
  }

  if (
    !state.settings ||
    !state.settings.pauseOnHover ||
    !state.video ||
    state.video.paused ||
    !isHoveringSubtitle()
  ) {
    return;
  }

  if (primaryCue && primaryCue !== state.lastPausedPrimaryCue) {
    const duration = primaryCue.end - primaryCue.start;
    const threshold = Math.min(150, duration / 2);
    if (timeMs >= primaryCue.end - threshold) {
      state.video.pause();
      state.lastPausedPrimaryCue = primaryCue;
    }
  } else if (secondaryCue && secondaryCue !== state.lastPausedSecondaryCue) {
    const duration = secondaryCue.end - secondaryCue.start;
    const threshold = Math.min(150, duration / 2);
    if (timeMs >= secondaryCue.end - threshold) {
      state.video.pause();
      state.lastPausedSecondaryCue = secondaryCue;
    }
  }
}

function startRenderLoop() {
  let lastTime = -1;

  function tick() {
    state.animFrameId = requestAnimationFrame(tick);

    if (!state.video) return;

    const timeMs = state.video.currentTime * 1000;

    if (Math.abs(timeMs - lastTime) < 50) return;
    lastTime = timeMs;

    checkPauseOnHover(timeMs);

    updateLine(state.primaryLine, state.primaryCues, timeMs);
    updateLine(state.secondaryLine, state.secondaryCues, timeMs);
  }

  tick();
}

function updateLine(lineEl, cues, timeMs) {
  if (!lineEl) return;

  if (!cues.length) {
    if (lineEl.innerHTML !== "") {
      lineEl.innerHTML = "";
      lineEl.dataset.current = "";
      hideTooltip();
    }
    return;
  }

  const cue = findCue(cues, timeMs);
  const newText = cue ? cue.text : "";

  if (lineEl.dataset.current === newText) return;

  lineEl.dataset.current = newText;
  lineEl.innerHTML = "";
  hideTooltip();

  if (!newText) return;

  const isJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(newText);

  if (isJapanese) {
    lineEl.dataset.pendingIchi = "true";

    const lines = newText.split("\\n");
    lines.forEach((line, i) => {
      const span = document.createElement("span");
      span.textContent = line;
      lineEl.appendChild(span);
      if (i < lines.length - 1) lineEl.appendChild(document.createElement("br"));
    });

    chrome.runtime.sendMessage({ type: "FETCH_ICHI", text: newText }, (res) => {
      if (lineEl.dataset.current !== newText) return;

      if (res && res.ok && res.html) {
        const parsed = parseIchiHtml(res.html);
        renderIchiInteractiveLine(lineEl, parsed, newText);
      }
    });
  } else {
    const lines = newText.split("\\n");
    lines.forEach((line, i) => {
      const span = document.createElement("span");
      span.textContent = line;
      lineEl.appendChild(span);
      if (i < lines.length - 1) lineEl.appendChild(document.createElement("br"));
    });
  }
}

function renderIchiInteractiveLine(lineEl, parsedData, originalText) {
  lineEl.innerHTML = "";
  delete lineEl.dataset.pendingIchi;

  const charElements = [];
  for (let i = 0; i < originalText.length; i++) {
    charElements[i] = { char: originalText[i], word: null };
  }

  let currentOffset = 0;

  parsedData.segments.forEach(segment => {
    // Some segments from ichi.moe may drop spaces/newlines, so we search from currentOffset
    const segmentTextStripped = segment.text.trim();
    if (!segmentTextStripped) return;

    // Find next non-whitespace match roughly
    const segmentStart = originalText.indexOf(segment.text, currentOffset);
    if (segmentStart !== -1) {
      segment.words.forEach(word => {
        if (word.start_index !== null && word.end_index !== null) {
          for (let i = segmentStart + word.start_index; i < segmentStart + word.end_index; i++) {
            if (charElements[i]) {
              charElements[i].word = word;
            }
          }
        }
      });
      currentOffset = segmentStart + segment.text.length;
    }
  });

  let currentWord = null;
  let currentSpan = null;

  for (let i = 0; i < charElements.length; i++) {
    const item = charElements[i];

    if (item.char === "\\n") {
      lineEl.appendChild(document.createElement("br"));
      currentWord = null;
      currentSpan = null;
      continue;
    }

    if (item.word !== currentWord || !item.word) {
      currentWord = item.word;
      currentSpan = document.createElement("span");
      if (currentWord) {
        const boundWord = currentWord;
        currentSpan.className = "ichi-word";
        currentSpan.dataset.wordData = JSON.stringify(boundWord);

        currentSpan.addEventListener("mouseenter", (e) => {
          showTooltip(boundWord, e.target.getBoundingClientRect());
          if (state.settings && state.settings.pauseOnHover && state.video && !state.video.paused) {
            state.video.pause();
          }
        });
        currentSpan.addEventListener("mouseleave", () => {
          hideTooltip();
        });
      }
      lineEl.appendChild(currentSpan);
    }

    currentSpan.textContent += item.char;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      resolve(res);
    });
  });
}
