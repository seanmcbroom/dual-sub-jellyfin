// src/content/index.js
// Injected into every page. Detects Jellyfin, hooks the video player,
// creates the subtitle overlay, and drives the render loop.

const { parseSubtitles, findCue } = require("./parser");

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
  jellyfinToken: null
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

    if (!settings.enabled) {
      return;
    }

    waitForVideo();
    observeNavigation();
  });

  chrome.runtime.onMessage.addListener((message) => {

    if (message.type === "SETTINGS_UPDATED") {
      state.settings = message.settings;

      applySettingsToOverlay();

      if (!message.settings.enabled) {
        teardown();
      }
    }

    if (message.type === "LOAD_TRACK") {
      loadTrack(message.role, message.url);
    }
  });
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
    waitForVideo();
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

  if (state.settings.hideOriginal) {
    suppressNativeSubtitles();
  }

  const tracks = await fetchSubtitleTracks();
  lastFetchedTracks = tracks;
  chrome.runtime.sendMessage({ type: "TRACKS_AVAILABLE", tracks });

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

  startRenderLoop();
}

function teardown() {
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
  if (state.overlay) state.overlay.remove();

  state = {
    ...state,
    video: null,
    overlay: null,
    primaryLine: null,
    secondaryLine: null,
    primaryCues: [],
    secondaryCues: [],
    animFrameId: null
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

function suppressNativeSubtitles() {
  const style = document.createElement("style");
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
      server.LocalAddress ||
      server.ManualAddress ||
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

async function loadTrack(role, url) {
  const response = await chrome.runtime.sendMessage({
    type: "FETCH_SUBTITLE",
    url,
    token: state.jellyfinToken
  });

  if (!response?.ok) {
    return;
  }

  const cues = parseSubtitles(response.text, url);

  if (role === "primary") state.primaryCues = cues;
  else state.secondaryCues = cues;
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startRenderLoop() {
  let lastTime = -1;

  function tick() {
    state.animFrameId = requestAnimationFrame(tick);

    if (!state.video) return;

    const timeMs = state.video.currentTime * 1000;

    if (Math.abs(timeMs - lastTime) < 50) return;
    lastTime = timeMs;

    updateLine(state.primaryLine, state.primaryCues, timeMs);
    updateLine(state.secondaryLine, state.secondaryCues, timeMs);
  }

  tick();
}

function updateLine(lineEl, cues, timeMs) {
  if (!lineEl) return;

  if (!cues.length) {
    return;
  }

  const cue = findCue(cues, timeMs);
  const newText = cue ? cue.text : "";

  if (lineEl.dataset.current === newText) return;

  lineEl.dataset.current = newText;
  lineEl.innerHTML = "";

  if (!newText) return;

  const lines = newText.split("\n");
  lines.forEach((line, i) => {
    const span = document.createElement("span");
    span.textContent = line;
    lineEl.appendChild(span);
    if (i < lines.length - 1) lineEl.appendChild(document.createElement("br"));
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      resolve(res);
    });
  });
}
