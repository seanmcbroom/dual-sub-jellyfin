const $ = id => document.getElementById(id);

let settings = {};
let availableTracks = [];

// ── Init ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  settings = await getSettings();
  applySettingsToUI();
  wireControls();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED") {
      settings = message.settings;
      applySettingsToUI();
    }

    if (message.type === "TRACKS_AVAILABLE") {
      availableTracks = message.tracks;
      populateTrackSelects(availableTracks);
    }
  });

  const tab = await getActiveTab();
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: "REQUEST_TRACKS" }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Open a Jellyfin video.");
      }
    });
  }
});

// ── Core ─────────────────────────────────────────
function updateSetting(key, value, { broadcast = true } = {}) {
  if (settings[key] === value) return;

  settings[key] = value;

  chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings
  });

  if (broadcast) broadcastSettings();
  flashSaved();
}

function debounce(fn, delay = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const debouncedUpdate = debounce(updateSetting, 150);

// ── UI Wiring ────────────────────────────────────
function wireControls() {
  $("primary-size").addEventListener("input", e => {
    const v = +e.target.value;
    $("primary-size-val").textContent = v + "px";
    debouncedUpdate("primarySize", v);
  });

  $("secondary-size").addEventListener("input", e => {
    const v = +e.target.value;
    $("secondary-size-val").textContent = v + "px";
    debouncedUpdate("secondarySize", v);
  });

  $("bg-opacity").addEventListener("input", e => {
    const v = +e.target.value;
    $("bg-opacity-val").textContent = Math.round(v * 100) + "%";
    debouncedUpdate("bgOpacity", v);
  });

  $("primary-offset").addEventListener("input", e =>
    debouncedUpdate("primaryOffset", parseInt(e.target.value, 10) || 0)
  );

  $("secondary-offset").addEventListener("input", e =>
    debouncedUpdate("secondaryOffset", parseInt(e.target.value, 10) || 0)
  );

  $("primary-color").addEventListener("input", e =>
    updateSetting("primaryColor", e.target.value)
  );

  $("secondary-color").addEventListener("input", e =>
    updateSetting("secondaryColor", e.target.value)
  );

  $("hide-original").addEventListener("change", e =>
    updateSetting("hideOriginal", e.target.checked)
  );

  $("first-on-pause").addEventListener("change", e =>
    updateSetting("firstOnPause", e.target.checked)
  );
  
  $("secondary-on-pause").addEventListener("change", e =>
    updateSetting("secondaryOnPause", e.target.checked)
  );

  $("default-primary-lang").addEventListener("change", e =>
    updateSetting("defaultPrimaryLang", e.target.value.trim())
  );

  $("default-secondary-lang").addEventListener("change", e =>
    updateSetting("defaultSecondaryLang", e.target.value.trim())
  );

  $("primary-select").addEventListener("change", onTrackChange);
  $("secondary-select").addEventListener("change", onTrackChange);

  document.querySelectorAll(".offset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $(`${btn.dataset.track}-offset`);
      const newVal =
        (parseInt(input.value || 0, 10)) +
        parseInt(btn.dataset.delta, 10);

      input.value = newVal;

      updateSetting(
        btn.dataset.track === "primary"
          ? "primaryOffset"
          : "secondaryOffset",
        newVal
      );
    });
  });
}

// ── Tracks ───────────────────────────────────────
function onTrackChange() {
  const primaryUrl = $("primary-select").value;
  const secondaryUrl = $("secondary-select").value;

  const p = availableTracks.find(t => t.url === primaryUrl);
  const s = availableTracks.find(t => t.url === secondaryUrl);

  updateSetting("primaryLang", p?.label || "", { broadcast: false });
  updateSetting("secondaryLang", s?.label || "", { broadcast: false });

  updateSetting("primaryUrl", primaryUrl || "", { broadcast: false });
  updateSetting("secondaryUrl", secondaryUrl || "", { broadcast: false });

  getActiveTab().then(tab => {
    if (!tab) return;

    if (primaryUrl) {
      chrome.tabs.sendMessage(tab.id, {
        type: "LOAD_TRACK",
        role: "primary",
        url: primaryUrl
      });
    }

    if (secondaryUrl) {
      chrome.tabs.sendMessage(tab.id, {
        type: "LOAD_TRACK",
        role: "secondary",
        url: secondaryUrl
      });
    }
  });

  broadcastSettings();
}

// ── UI Sync ──────────────────────────────────────
function applySettingsToUI() {
  $("primary-offset").value = settings.primaryOffset || 0;
  $("secondary-offset").value = settings.secondaryOffset || 0;

  $("primary-size").value = settings.primarySize || 22;
  $("secondary-size").value = settings.secondarySize || 16;

  $("primary-color").value = settings.primaryColor || "#ffffff";
  $("secondary-color").value = settings.secondaryColor || "#cccccc";

  $("bg-opacity").value = settings.bgOpacity ?? 0.6;

  $("hide-original").checked = settings.hideOriginal !== false;
  $("first-on-pause").checked = !!settings.firstOnPause;
  $("secondary-on-pause").checked = !!settings.secondaryOnPause;

  $("primary-size-val").textContent = $("primary-size").value + "px";
  $("secondary-size-val").textContent = $("secondary-size").value + "px";
  $("bg-opacity-val").textContent =
    Math.round($("bg-opacity").value * 100) + "%";

  $("default-primary-lang").value = settings.defaultPrimaryLang || "";
  $("default-secondary-lang").value = settings.defaultSecondaryLang || "";
}

// ── Misc ─────────────────────────────────────────
function populateTrackSelects(tracks) {
  [$("primary-select"), $("secondary-select")].forEach(sel => {
    while (sel.options.length > 1) sel.remove(1);
    tracks.forEach(t => sel.appendChild(new Option(t.label, t.url)));
  });
}

function broadcastSettings() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "SETTINGS_UPDATED",
        settings
      });
    }
  });
}

function showStatus(msg) {
  const el = $("status-msg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function flashSaved() {
  const el = $("save-msg");
  el.textContent = "Saved";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1500);
}

function getSettings() {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, resolve)
  );
}

function getActiveTab() {
  return new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]))
  );
}