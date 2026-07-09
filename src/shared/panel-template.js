// src/shared/panel-template.js
// Markup for the settings panel body. Rendered once into whatever container
// the host page provides — the extension popup, or a floating panel docked
// next to the player's CC button. Both hosts wire the same controller
// (panel-controller.js) on top of this markup, so styling and behaviour
// only need to be written once.

const ICONS = require("./icons");

function offsetControls(track) {
  return `
    <div class="jf-offset-controls">
      <button type="button" class="jf-offset-btn" data-track="${track}" data-delta="-500">−500</button>
      <button type="button" class="jf-offset-btn" data-track="${track}" data-delta="-100">−100</button>
      <input type="number" id="jfds-${track}-offset" class="jf-offset-input" value="0" step="100" min="-10000" max="10000" inputmode="numeric">
      <button type="button" class="jf-offset-btn" data-track="${track}" data-delta="100">+100</button>
      <button type="button" class="jf-offset-btn" data-track="${track}" data-delta="500">+500</button>
    </div>`;
}

function toggleRow(id, label) {
  return `
    <label class="jf-toggle-wrap" for="jfds-${id}">
      <span class="jf-toggle-label">${label}</span>
      <span class="jf-toggle-track"><span class="jf-toggle-thumb"></span></span>
      <input type="checkbox" id="jfds-${id}" class="jf-visually-hidden">
    </label>`;
}

function styleRow(track, label) {
  return `
    <div class="jf-style-row">
      <div class="jf-style-row-head">
        <span class="jf-style-dot" id="jfds-${track}-dot"></span>
        <span class="jf-style-name">${label}</span>
        <input type="color" id="jfds-${track}-color" class="jf-color-input" value="${track === "primary" ? "#ffffff" : "#cccccc"}">
      </div>
      <div class="jf-style-row-body">
        <input type="range" id="jfds-${track}-size" class="jf-range" min="${track === "primary" ? 12 : 10}" max="${track === "primary" ? 48 : 36}" value="${track === "primary" ? 22 : 16}">
        <span class="jf-style-val" id="jfds-${track}-size-val">${track === "primary" ? "22px" : "16px"}</span>
      </div>
    </div>`;
}

function panelTemplate() {
  return `
    <div id="jfds-status" class="jf-panel-status jf-hidden"></div>

    <section class="jf-section">
      <h2 class="jf-section-title"><span class="jf-section-icon">${ICONS.tracks}</span>Subtitle tracks</h2>

      <div class="jf-panel-row jf-select-row">
        <label for="jfds-primary-select">Primary <span class="jf-dim">(top)</span></label>
        <div class="jf-select-wrap">
          <select id="jfds-primary-select"></select>
          <span class="jf-select-chevron">${ICONS.chevron}</span>
        </div>
      </div>

      <div class="jf-panel-row jf-offset-row">
        <label for="jfds-primary-offset">Offset</label>
        ${offsetControls("primary")}
      </div>

      <div class="jf-panel-row jf-select-row">
        <label for="jfds-secondary-select">Secondary <span class="jf-dim">(bottom)</span></label>
        <div class="jf-select-wrap">
          <select id="jfds-secondary-select"></select>
          <span class="jf-select-chevron">${ICONS.chevron}</span>
        </div>
      </div>

      <div class="jf-panel-row jf-offset-row">
        <label for="jfds-secondary-offset">Offset</label>
        ${offsetControls("secondary")}
      </div>
    </section>

    <hr class="jf-panel-hr">

    <section class="jf-section">
      <h2 class="jf-section-title"><span class="jf-section-icon">${ICONS.style}</span>Subtitle style</h2>

      ${styleRow("primary", "Primary")}
      ${styleRow("secondary", "Secondary")}

      <div class="jf-panel-row jf-slider-row jf-bg-row">
        <label for="jfds-bg-opacity">Background</label>
        <input type="range" id="jfds-bg-opacity" class="jf-range" min="0" max="1" step="0.05" value="0.6">
        <span class="jf-style-val" id="jfds-bg-opacity-val">60%</span>
      </div>
    </section>

    <hr class="jf-panel-hr">

    <section class="jf-section">
      <h2 class="jf-section-title"><span class="jf-section-icon">${ICONS.behavior}</span>Behavior</h2>

      <div class="jf-toggle-list">
        ${toggleRow("first-on-pause", "Primary on pause only")}
        ${toggleRow("secondary-on-pause", "Secondary on pause only")}
        ${toggleRow("hide-original", "Hide native subtitles")}
        ${toggleRow("pause-on-hover", "Pause on hover")}
      </div>
    </section>

    <hr class="jf-panel-hr">

    <section class="jf-section">
      <h2 class="jf-section-title"><span class="jf-section-icon">${ICONS.language}</span>Default languages</h2>
      <p class="jf-hint">Auto-selected when opening a video.</p>

      <div class="jf-panel-row">
        <label for="jfds-default-primary-lang">Primary</label>
        <input type="text" id="jfds-default-primary-lang" class="jf-text-input" placeholder="e.g. Japanese">
      </div>

      <div class="jf-panel-row">
        <label for="jfds-default-secondary-lang">Secondary</label>
        <input type="text" id="jfds-default-secondary-lang" class="jf-text-input" placeholder="e.g. English">
      </div>
    </section>
  `;
}

function panelHeaderTemplate({ closable = false } = {}) {
  return `
    <div class="jf-header-left">
      <span class="jf-header-icon">${ICONS.dualSubs}</span>
      <h1 class="jf-header-title">Dual Subtitles</h1>
    </div>
    <div class="jf-header-right">
      <span class="jf-save-toast jf-hidden" id="jfds-save-toast">${ICONS.check}<span>Saved</span></span>
      <label class="jf-toggle-wrap jf-header-toggle" for="jfds-enabled">
        <span class="jf-toggle-track"><span class="jf-toggle-thumb"></span></span>
        <input type="checkbox" id="jfds-enabled" class="jf-visually-hidden" checked>
      </label>
      ${closable ? `<button type="button" class="jf-close-btn" id="jfds-close">${ICONS.close}</button>` : ""}
    </div>
  `;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = panelTemplate;
  module.exports.panelHeaderTemplate = panelHeaderTemplate;
}
