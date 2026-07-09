// src/popup/popup.js
// Bundled with esbuild (see scripts/build.js). Mounts the shared settings
// panel and wires it up using the extension-popup messaging pattern:
// settings live in the background service worker, and the active tab's
// content script is reached via chrome.tabs.sendMessage.

const panelTemplate = require("../shared/panel-template");
const { panelHeaderTemplate } = panelTemplate;
const mountPanel = require("../shared/panel-controller");

let settings = {};
let controller = null;

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("jfds-header").innerHTML = panelHeaderTemplate({ closable: false });
  document.getElementById("jfds-body").innerHTML = panelTemplate();

  const host = {
    updateSetting,
    onTrackSelect,
    requestTracks
  };

  controller = mountPanel(document, host);

  settings = await getSettings();
  controller.setSettings(settings);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED") {
      settings = message.settings;
      controller.setSettings(settings);
    }

    if (message.type === "TRACKS_AVAILABLE") {
      controller.setTracks(message.tracks);
    }
  });
});

// ── Host adapter ─────────────────────────────────────────────────────────

function updateSetting(key, value, { broadcast = true, silent = false } = {}) {
  if (settings[key] === value) return;

  settings[key] = value;

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });

  if (broadcast) broadcastSettings();
  if (!silent) controller.flashSaved();
}

function onTrackSelect(role, url) {
  getActiveTab().then(tab => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "LOAD_TRACK", role, url });
  });
  broadcastSettings();
}

async function requestTracks() {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { type: "REQUEST_TRACKS" }, () => {
    if (chrome.runtime.lastError) {
      controller.showStatus("Open a Jellyfin video to pick tracks.", { persist: true });
    }
  });
}

function broadcastSettings() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SETTINGS_UPDATED", settings });
    }
  });
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
