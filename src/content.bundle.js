(() => {
  // src/content.js
  function parseSubtitles(raw, url = "") {
    console.log("[DualSubs][Parser] parseSubtitles called", {
      url,
      length: raw?.length
    });
    const trimmed = raw.trim();
    if (url.endsWith(".ass") || url.endsWith(".ssa") || trimmed.startsWith("[Script Info]")) {
      console.log("[DualSubs][Parser] Detected ASS/SSA format");
      return parseASS(trimmed);
    }
    if (trimmed.startsWith("WEBVTT")) {
      console.log("[DualSubs][Parser] Detected VTT format");
      return parseVTT(trimmed);
    }
    console.log("[DualSubs][Parser] Defaulting to SRT format");
    return parseSRT(trimmed);
  }
  function parseSRT(raw) {
    console.log("[DualSubs][Parser][SRT] Parsing SRT");
    const cues = [];
    const blocks = raw.split(/\n\s*\n/);
    console.log("[DualSubs][Parser][SRT] Blocks found:", blocks.length);
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 2)
        continue;
      const tcIndex = lines.findIndex((l) => l.includes("-->"));
      if (tcIndex === -1)
        continue;
      try {
        const [startStr, endStr] = lines[tcIndex].split("-->").map((s) => s.trim());
        const start = srtTimeToMs(startStr);
        const end = srtTimeToMs(endStr);
        const text = lines.slice(tcIndex + 1).join("\n");
        cues.push({ start, end, text: stripTags(text) });
      } catch (e) {
        console.warn("[DualSubs][Parser][SRT] Failed to parse block:", block, e);
      }
    }
    console.log("[DualSubs][Parser][SRT] Parsed cues:", cues.length);
    return cues;
  }
  function srtTimeToMs(t) {
    try {
      const [time, ms] = t.split(",");
      const [h, m, s] = time.split(":").map(Number);
      return (h * 3600 + m * 60 + s) * 1e3 + Number(ms);
    } catch (e) {
      console.warn("[DualSubs][Parser] Bad SRT timestamp:", t);
      return 0;
    }
  }
  function parseVTT(raw) {
    console.log("[DualSubs][Parser][VTT] Parsing VTT");
    const cues = [];
    const blocks = raw.split(/\n\s*\n/);
    console.log("[DualSubs][Parser][VTT] Blocks found:", blocks.length);
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const tcIndex = lines.findIndex((l) => l.includes("-->"));
      if (tcIndex === -1)
        continue;
      try {
        const parts = lines[tcIndex].split(/\s+/);
        const startStr = parts[0];
        const endStr = parts[2];
        const start = vttTimeToMs(startStr);
        const end = vttTimeToMs(endStr);
        const text = lines.slice(tcIndex + 1).join("\n");
        cues.push({ start, end, text: stripTags(text) });
      } catch (e) {
        console.warn("[DualSubs][Parser][VTT] Failed block:", block, e);
      }
    }
    console.log("[DualSubs][Parser][VTT] Parsed cues:", cues.length);
    return cues;
  }
  function vttTimeToMs(t) {
    try {
      const parts = t.split(":");
      let h = 0, m, s;
      if (parts.length === 3) {
        [h, m, s] = parts;
      } else {
        [m, s] = parts;
      }
      const [sec, ms] = String(s).split(".");
      return (Number(h) * 3600 + Number(m) * 60 + Number(sec)) * 1e3 + Number((ms || "0").padEnd(3, "0"));
    } catch (e) {
      console.warn("[DualSubs][Parser] Bad VTT timestamp:", t);
      return 0;
    }
  }
  function parseASS(raw) {
    console.log("[DualSubs][Parser][ASS] Parsing ASS/SSA");
    const cues = [];
    let inEvents = false;
    let formatFields = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "[Events]") {
        console.log("[DualSubs][Parser][ASS] Entering Events section");
        inEvents = true;
        continue;
      }
      if (trimmed.startsWith("[") && trimmed !== "[Events]") {
        inEvents = false;
        continue;
      }
      if (!inEvents)
        continue;
      if (trimmed.startsWith("Format:")) {
        formatFields = trimmed.slice(7).split(",").map((f) => f.trim().toLowerCase());
        console.log("[DualSubs][Parser][ASS] Format fields:", formatFields);
        continue;
      }
      if (trimmed.startsWith("Dialogue:")) {
        try {
          const values = trimmed.slice(9).split(",");
          const get = (key) => {
            const i = formatFields.indexOf(key);
            if (i === -1)
              return "";
            if (key === "text")
              return values.slice(i).join(",").trim();
            return (values[i] || "").trim();
          };
          const start = assTimeToMs(get("start"));
          const end = assTimeToMs(get("end"));
          const text = stripASSOverrides(get("text"));
          if (text)
            cues.push({ start, end, text });
        } catch (e) {
          console.warn("[DualSubs][Parser][ASS] Failed dialogue line:", trimmed, e);
        }
      }
    }
    cues.sort((a, b) => a.start - b.start);
    console.log("[DualSubs][Parser][ASS] Parsed cues:", cues.length);
    return cues;
  }
  function assTimeToMs(t) {
    try {
      const [h, m, rest] = t.split(":");
      const [s, cs] = rest.split(".");
      return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1e3 + Number(cs) * 10;
    } catch (e) {
      console.warn("[DualSubs][Parser] Bad ASS timestamp:", t);
      return 0;
    }
  }
  function stripASSOverrides(text) {
    return text.replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").replace(/\\n/gi, "\n").trim();
  }
  function stripTags(text) {
    return text.replace(/<[^>]*>/g, "").trim();
  }
  function findCue(cues, timeMs) {
    if (!cues.length) {
      console.log("[DualSubs][Parser] findCue called with empty cues");
      return null;
    }
    let lo = 0;
    let hi = cues.length - 1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      const cue = cues[mid];
      if (timeMs < cue.start) {
        hi = mid - 1;
      } else if (timeMs > cue.end) {
        lo = mid + 1;
      } else {
        return cue;
      }
    }
    return null;
  }
  var state = {
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
  var lastFetchedTracks = [];
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
      console.log("[DualSubs][Content] Not a Jellyfin page \u2192 exiting");
      return;
    }
    console.log("[DualSubs][Content] Jellyfin page detected");
    loadSettings().then((settings) => {
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
          console.log("[DualSubs][Content] Disabled \u2192 teardown");
          teardown();
        }
      }
      if (message.type === "LOAD_TRACK") {
        console.log("[DualSubs][Content] LOAD_TRACK:", message.role, message.url);
        loadTrack(message.role, message.url);
      }
    });
  }
  function isJellyfinPage() {
    const result = document.querySelector('meta[name="application-name"][content="Jellyfin"]') !== null || document.querySelector("#jellyfin-metro-js") !== null || window.__jellyfin !== void 0;
    console.log("[DualSubs][Content] isJellyfinPage:", result);
    return result;
  }
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
    setInterval(() => {
      if (location.href !== lastHref) {
        console.log("[DualSubs][Content] Navigation detected:", location.href);
        lastHref = location.href;
        teardown();
        waitForVideo();
      }
    }, 1e3);
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
    console.log("[DualSubs] track URLs:", tracks.map((t) => t.url));
    let primaryTrack = tracks.find((t) => t.label === state.settings.primaryLang);
    console.log("[DualSubs][Content] load secondary by lang:", primaryTrack);
    if (primaryTrack) {
      await loadTrack("primary", primaryTrack.url);
    } else {
      primaryTrack = tracks.find((t) => t.label.toLowerCase().includes(state.settings.defaultPrimaryLang.toLowerCase()));
      console.log("[DualSubs][Content] Auto-load primary:", primaryTrack);
      if (primaryTrack) {
        await loadTrack("primary", primaryTrack.url);
        state.settings.primaryLang = primaryTrack.label;
      }
    }
    let secondaryTrack = tracks.find((t) => t.label === state.settings.secondaryLang);
    console.log("[DualSubs][Content] load secondary by lang:", secondaryTrack);
    if (secondaryTrack) {
      await loadTrack("secondary", secondaryTrack.url);
    } else {
      secondaryTrack = tracks.find((t) => t.label.toLowerCase().includes(state.settings.defaultSecondaryLang.toLowerCase()));
      console.log("[DualSubs][Content] Auto-load secondary:", secondaryTrack);
      if (secondaryTrack) {
        await loadTrack("secondary", secondaryTrack.url);
        state.settings.secondaryLang = secondaryTrack.label;
      }
    }
    ;
    startRenderLoop();
  }
  function teardown() {
    console.log("[DualSubs][Content] Teardown");
    if (state.animFrameId)
      cancelAnimationFrame(state.animFrameId);
    if (state.overlay)
      state.overlay.remove();
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
  function createOverlay() {
    console.log("[DualSubs] createOverlay");
    if (!state.video) {
      console.warn("[DualSubs] No video found for overlay");
      return;
    }
    if (document.getElementById("jf-dual-subs-overlay"))
      return;
    const overlay = document.createElement("div");
    overlay.id = "jf-dual-subs-overlay";
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
    if (!state.video || !state.primaryLine)
      return;
    const paused = state.video.paused;
    state.primaryLine.style.opacity = paused || !state.settings.firstOnPause ? "1" : "0";
  }
  function updateSecondaryVisibility() {
    if (!state.video || !state.secondaryLine)
      return;
    const paused = state.video.paused;
    state.secondaryLine.style.opacity = paused || !state.settings.secondaryOnPause ? "1" : "0";
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
      state.overlay.style.setProperty(
        "--sub-bg-opacity",
        s.bgOpacity ?? 0.6
      );
    }
    console.log("[DualSubs] Overlay styles applied");
  }
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
      state.jellyfinApiBase = (server.LocalAddress || server.ManualAddress || server.RemoteAddress || "").replace(/\/$/, "");
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
    const btn = document.querySelector("button.btnUserRating[data-id]") || document.querySelector('button[is="emby-ratingbutton"][data-id]');
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
        `${state.jellyfinApiBase}/Items/${itemId}/PlaybackInfo`,
        {
          method: "POST",
          headers: {
            Authorization: getJellyfinAuthHeader(),
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({})
        }
      );
      console.log("[DualSubs][Content] PlaybackInfo status:", res.status);
      if (!res.ok)
        return [];
      const data = await res.json();
      const mediaSource = data?.MediaSources?.[0];
      if (!mediaSource) {
        console.warn("[DualSubs][Content] No media source");
        return [];
      }
      const tracks = (mediaSource.MediaStreams || []).filter((s) => s.Type === "Subtitle").map((s) => ({
        index: s.Index,
        label: s.DisplayTitle || s.Language || `Track ${s.Index}`,
        url: `${state.jellyfinApiBase}/Videos/${itemId}/${mediaSource.Id}/Subtitles/${s.Index}/Stream.${(s.Codec || "srt").toLowerCase()}`
      }));
      console.log("[DualSubs][Content] Parsed tracks:", tracks.length);
      return tracks;
    } catch (e) {
      console.warn("[DualSubs][Content] Track fetch error:", e);
      return [];
    }
  }
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
    if (role === "primary")
      state.primaryCues = cues;
    else
      state.secondaryCues = cues;
  }
  function startRenderLoop() {
    console.log("[DualSubs][Content] Starting render loop");
    let lastTime = -1;
    function tick() {
      state.animFrameId = requestAnimationFrame(tick);
      if (!state.video)
        return;
      const timeMs = state.video.currentTime * 1e3;
      if (Math.abs(timeMs - lastTime) < 50)
        return;
      lastTime = timeMs;
      updateLine(state.primaryLine, state.primaryCues, timeMs);
      updateLine(state.secondaryLine, state.secondaryCues, timeMs);
    }
    tick();
  }
  function updateLine(lineEl, cues, timeMs) {
    if (!lineEl)
      return;
    if (!cues.length) {
      if (Math.random() < 0.01) {
        console.log("[DualSubs][Content] No cues yet");
      }
      return;
    }
    const cue = findCue(cues, timeMs);
    const newText = cue ? cue.text : "";
    if (lineEl.dataset.current === newText)
      return;
    console.log("[DualSubs][Content] Updating subtitle:", newText);
    lineEl.dataset.current = newText;
    lineEl.innerHTML = "";
    if (!newText)
      return;
    const lines = newText.split("\n");
    lines.forEach((line, i) => {
      const span = document.createElement("span");
      span.textContent = line;
      lineEl.appendChild(span);
      if (i < lines.length - 1)
        lineEl.appendChild(document.createElement("br"));
    });
  }
  function loadSettings() {
    console.log("[DualSubs][Content] Requesting settings");
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
        console.log("[DualSubs][Content] Settings response:", res);
        resolve(res);
      });
    });
  }
})();
