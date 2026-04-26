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
    console.log("[DualSubs] Popup requested tracks");
    chrome.runtime.sendMessage({
      type: "TRACKS_AVAILABLE",
      tracks: lastFetchedTracks || []
    });
  }
});

init();

function init() {
  console.log("[DualSubs][Content] Init start");

  if (!isJellyfinPage()) {
    console.log("[DualSubs][Content] Not a Jellyfin page → exiting");
    return;
  }

  console.log("[DualSubs][Content] Jellyfin page detected");

  loadSettings().then(settings => {
    console.log("[DualSubs][Content] Settings loaded:", settings);

    state.settings = settings;

    if (!settings.enabled) {
      console.log("[DualSubs][Content] Extension disabled in settings");
      return;
    }

    waitForVideo();
    observeNavigation();
  });

  chrome.runtime.onMessage.addListener((message) => {
    console.log("[DualSubs][Content] Message received:", message);

    if (message.type === "SETTINGS_UPDATED") {
      state.settings = message.settings;
      console.log("[DualSubs][Content] Settings updated:", message.settings);

      applySettingsToOverlay();

      if (!message.settings.enabled) {
        console.log("[DualSubs][Content] Disabled → teardown");
        teardown();
      }
    }

    if (message.type === "LOAD_TRACK") {
      console.log("[DualSubs][Content] LOAD_TRACK:", message.role, message.url);
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

  console.log("[DualSubs][Content] isJellyfinPage:", result);
  return result;
}

// ── Video detection ───────────────────────────────────────────────────────────

function waitForVideo() {
  console.log("[DualSubs][Content] Waiting for video element...");

  const existing = document.querySelector("video");
  if (existing) {
    console.log("[DualSubs][Content] Video already exists");
    onVideoFound(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const video = document.querySelector("video");
    if (video) {
      console.log("[DualSubs][Content] Video detected via observer");
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
    console.log("[DualSubs][Content] Navigation detected:", location.href);
    lastHref = location.href;
    teardown();
    waitForVideo();
  }

  // History API navigation (pushState / replaceState) — Jellyfin's primary nav
  window.addEventListener("popstate", handleNavigation);

  // Jellyfin updates <title> on every route change — catches pushState navigations
  // that don't fire popstate (e.g. router.push)
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(handleNavigation).observe(titleEl, { childList: true });
  }
}

async function onVideoFound(video) {
  console.log("[DualSubs][Content] onVideoFound");

  state.video = video;
  lastFetchedTracks = [];

  detectJellyfinCredentials();
  console.log("[DualSubs][Content] Jellyfin credentials checked");

  createOverlay();

  function updateVisibilities() {
    updatePrimaryVisibility();
    updateSecondaryVisibility();
  }
  state.video.addEventListener("play", updateVisibilities);
  state.video.addEventListener("pause", updateVisibilities);
  updateVisibilities();

  if (state.settings.hideOriginal) {
    console.log("[DualSubs][Content] Hiding native subtitles");
    suppressNativeSubtitles();
  }

  const tracks = await fetchSubtitleTracks();
  lastFetchedTracks = tracks;
  console.log("[DualSubs][Content] Tracks found:", tracks);
  chrome.runtime.sendMessage({ type: "TRACKS_AVAILABLE", tracks });
  console.log("[DualSubs] track URLs:", tracks.map(t => t.url));

  let primaryTrack = tracks.find(t => t.label === state.settings.primaryLang);
  console.log("[DualSubs][Content] load primary by lang:", primaryTrack);
  if (primaryTrack) {
    await loadTrack("primary", primaryTrack.url);
  } else {
    primaryTrack = tracks.find(t => t.label.toLowerCase().includes(state.settings.defaultPrimaryLang.toLowerCase()));
    console.log("[DualSubs][Content] Auto-load primary:", primaryTrack);
    if (primaryTrack) {
      await loadTrack("primary", primaryTrack.url);
      state.settings.primaryLang = primaryTrack.label;
    }
  }

  let secondaryTrack = tracks.find(t => t.label === state.settings.secondaryLang);
  console.log("[DualSubs][Content] load secondary by lang:", secondaryTrack);
  if (secondaryTrack) {
    await loadTrack("secondary", secondaryTrack.url);
  } else {
    secondaryTrack = tracks.find(t => t.label.toLowerCase().includes(state.settings.defaultSecondaryLang.toLowerCase()));
    console.log("[DualSubs][Content] Auto-load secondary:", secondaryTrack);
    if (secondaryTrack) {
      await loadTrack("secondary", secondaryTrack.url);
      state.settings.secondaryLang = secondaryTrack.label;
    }
  }

  startRenderLoop();
}

function teardown() {
  console.log("[DualSubs][Content] Teardown");

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
  console.log("[DualSubs] createOverlay");

  if (!state.video) {
    console.warn("[DualSubs] createOverlay: no video in state");
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

  console.log("[DualSubs] Overlay created successfully");
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
  console.log("[DualSubs] applySettingsToOverlay");

  if (!state.primaryLine || !state.secondaryLine) {
    console.warn("[DualSubs] Overlay lines not ready");
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

  console.log("[DualSubs] Overlay styles applied");
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
  console.log("[DualSubs] Native subtitles suppressed");
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
      console.warn("[DualSubs][Content] No server info in credentials");
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

    console.log("[DualSubs][Content] Jellyfin creds:", {
      base: state.jellyfinApiBase,
      hasToken: !!state.jellyfinToken
    });

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
    console.warn("[DualSubs] No itemId found in favorite button");
    return null;
  }

  console.log("[DualSubs] ItemId from favorite button:", id);
  return id;
}

function getJellyfinAuthHeader() {
  return `MediaBrowser Client="Jellyfin Web", Token="${state.jellyfinToken}"`;
}

async function fetchSubtitleTracks() {
  console.log("[DualSubs][Content] Fetching subtitle tracks");

  const itemId = getItemIdFromFavoriteButton();

  if (!itemId) {
    console.warn("[DualSubs][Content] No item ID found");
    return [];
  }

  if (!state.jellyfinApiBase || !state.jellyfinToken) {
    console.warn("[DualSubs][Content] Missing API base or token");
    return [];
  }

  console.log("[DualSubs][Content] Item ID:", itemId);

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

    console.log("[DualSubs][Content] PlaybackInfo status:", res.status);

    if (!res.ok) return [];

    const data = await res.json();
    const mediaSource = data?.MediaSources?.[0];

    if (!mediaSource) {
      console.warn("[DualSubs][Content] No media source");
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

    console.log("[DualSubs][Content] Parsed tracks:", tracks.length);
    return tracks;

  } catch (e) {
    console.warn("[DualSubs][Content] Track fetch error:", e);
    return [];
  }
}

// ── Track loading ─────────────────────────────────────────────────────────────

async function loadTrack(role, url) {
  console.log("[DualSubs][Content] loadTrack:", role, url);

  const response = await chrome.runtime.sendMessage({
    type: "FETCH_SUBTITLE",
    url,
    token: state.jellyfinToken
  });

  console.log("[DualSubs][Content] Fetch response:", response);

  if (!response?.ok) {
    console.warn("[DualSubs][Content] Fetch failed:", response?.error);
    console.warn("[DualSubs][Content] URL was:", url);
    return;
  }

  const cues = parseSubtitles(response.text, url);
  console.log("[DualSubs][Content] Parsed cues:", cues.length);

  if (role === "primary") state.primaryCues = cues;
  else state.secondaryCues = cues;
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startRenderLoop() {
  console.log("[DualSubs][Content] Starting render loop");

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
    if (Math.random() < 0.01) {
      console.log("[DualSubs][Content] No cues yet");
    }
    return;
  }

  const cue = findCue(cues, timeMs);
  const newText = cue ? cue.text : "";

  if (lineEl.dataset.current === newText) return;

  console.log("[DualSubs][Content] Updating subtitle:", newText);

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
  console.log("[DualSubs][Content] Requesting settings");

  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      console.log("[DualSubs][Content] Settings response:", res);
      resolve(res);
    });
  });
}
