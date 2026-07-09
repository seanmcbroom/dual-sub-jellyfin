// src/shared/panel-controller.js
// Wires up the markup from panel-template.js. Doesn't know or care whether
// it's running inside the extension popup or a panel injected into the
// Jellyfin page — all of that is abstracted behind `host`:
//
//   host.updateSetting(key, value, opts)   persist + apply a single setting
//   host.onTrackSelect(role, url)          user picked a track from a <select>
//   host.requestTracks()                   ask for the current track list
//
// The controller exposes a small imperative API back to the host:
//
//   controller.setSettings(settings)       reflect settings into the UI
//   controller.setTracks(tracks)           populate the track <select>s
//   controller.showStatus(msg)             show a one-line status message
//   controller.destroy()                   remove listeners

function mountPanel(root, host) {
  const $ = id => root.querySelector(`#jfds-${id}`);

  let tracks = [];
  let currentSettings = {};
  const cleanupFns = [];

  function on(el, evt, fn) {
    if (!el) return;
    el.addEventListener(evt, fn);
    cleanupFns.push(() => el.removeEventListener(evt, fn));
  }

  function debounce(fn, delay = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ── Toggle switches ─────────────────────────────────────────────────────
  function wireToggle(id, key) {
    const wrap = root.querySelector(`label[for="jfds-${id}"]`);
    const input = wrap?.querySelector("input");

    if (!wrap || !input) return;

    on(input, "change", () => {
      wrap.querySelector(".jf-toggle-track")
        ?.classList.toggle("on", input.checked);

      host.updateSetting(key, input.checked);
    });
  }

  function setToggle(id, value) {
    const input = $(id);
    if (!input) return;
    input.checked = !!value;
    const wrap = root.querySelector(`label[for="jfds-${id}"]`);
    if (wrap) wrap.querySelector(".jf-toggle-track").classList.toggle("on", !!value);
  }

  // ── Style rows (size + colour, live dot preview) ────────────────────────
  function wireStyleRow(track, sizeKey, colorKey) {
    const size = $(`${track}-size`);
    const sizeVal = $(`${track}-size-val`);
    const color = $(`${track}-color`);
    const dot = $(`${track}-dot`);

    const debouncedSize = debounce(v => host.updateSetting(sizeKey, v), 120);

    on(size, "input", e => {
      const v = +e.target.value;
      if (sizeVal) sizeVal.textContent = v + "px";
      debouncedSize(v);
    });

    on(color, "input", e => {
      if (dot) dot.style.background = e.target.value;
      host.updateSetting(colorKey, e.target.value);
    });
  }

  function setStyleRow(track, size, color) {
    const sizeInput = $(`${track}-size`);
    const sizeVal = $(`${track}-size-val`);
    const colorInput = $(`${track}-color`);
    const dot = $(`${track}-dot`);

    if (sizeInput) sizeInput.value = size;
    if (sizeVal) sizeVal.textContent = size + "px";
    if (colorInput) colorInput.value = color;
    if (dot) dot.style.background = color;
  }

  // ── Range slider fill (visual progress track) ───────────────────────────
  function updateRangeFill(input) {
    if (!input) return;
    const min = +input.min || 0;
    const max = +input.max || 100;
    const pct = ((+input.value - min) / (max - min)) * 100;
    input.style.setProperty("--range-fill", `${pct}%`);
  }

  function wireRangeFill(input) {
    if (!input) return;
    updateRangeFill(input);
    on(input, "input", () => updateRangeFill(input));
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  wireToggle("first-on-pause", "firstOnPause");
  wireToggle("secondary-on-pause", "secondaryOnPause");
  wireToggle("hide-original", "hideOriginal");
  wireToggle("pause-on-hover", "pauseOnHover");
  wireToggle("enabled", "enabled");

  if (host.onClose) {
    on(root.querySelector("#jfds-close"), "click", host.onClose);
  }

  wireStyleRow("primary", "primarySize", "primaryColor");
  wireStyleRow("secondary", "secondarySize", "secondaryColor");

  [$("primary-size"), $("secondary-size"), $("bg-opacity")].forEach(wireRangeFill);

  const debouncedBgOpacity = debounce(v => host.updateSetting("bgOpacity", v), 120);
  on($("bg-opacity"), "input", e => {
    const v = +e.target.value;
    const valEl = $("bg-opacity-val");
    if (valEl) valEl.textContent = Math.round(v * 100) + "%";
    debouncedBgOpacity(v);
  });

  const debouncedPrimaryOffset = debounce(v => host.updateSetting("primaryOffset", v), 150);
  const debouncedSecondaryOffset = debounce(v => host.updateSetting("secondaryOffset", v), 150);

  on($("primary-offset"), "input", e => debouncedPrimaryOffset(parseInt(e.target.value, 10) || 0));
  on($("secondary-offset"), "input", e => debouncedSecondaryOffset(parseInt(e.target.value, 10) || 0));

  on($("default-primary-lang"), "change", e => host.updateSetting("defaultPrimaryLang", e.target.value.trim()));
  on($("default-secondary-lang"), "change", e => host.updateSetting("defaultSecondaryLang", e.target.value.trim()));

  function handleTrackChange() {
    const primaryUrl = $("primary-select").value;
    const secondaryUrl = $("secondary-select").value;

    const p = tracks.find(t => t.url === primaryUrl);
    const s = tracks.find(t => t.url === secondaryUrl);

    host.updateSetting("primaryLang", p?.label || "", { broadcast: false });
    host.updateSetting("secondaryLang", s?.label || "", { broadcast: false });
    host.updateSetting("primaryUrl", primaryUrl || "", { broadcast: false, silent: true });
    host.updateSetting("secondaryUrl", secondaryUrl || "", { broadcast: false, silent: true });

    if (primaryUrl) host.onTrackSelect("primary", primaryUrl);
    if (secondaryUrl) host.onTrackSelect("secondary", secondaryUrl);
  }

  on($("primary-select"), "change", handleTrackChange);
  on($("secondary-select"), "change", handleTrackChange);

  root.querySelectorAll(".jf-offset-btn").forEach(btn => {
    on(btn, "click", () => {
      const input = $(`${btn.dataset.track}-offset`);
      const newVal = (parseInt(input.value || 0, 10)) + parseInt(btn.dataset.delta, 10);
      input.value = newVal;
      host.updateSetting(btn.dataset.track === "primary" ? "primaryOffset" : "secondaryOffset", newVal);
    });
  });

  host.requestTracks();

  // ── Public API ───────────────────────────────────────────────────────────

  function setSettings(settings) {
    currentSettings = settings || {};
    const s = currentSettings;

    $("primary-select").value = s.primaryUrl || "";
    $("secondary-select").value = s.secondaryUrl || "";

    $("primary-offset").value = s.primaryOffset || 0;
    $("secondary-offset").value = s.secondaryOffset || 0;

    setStyleRow("primary", s.primarySize || 22, s.primaryColor || "#ffffff");
    setStyleRow("secondary", s.secondarySize || 16, s.secondaryColor || "#cccccc");

    $("bg-opacity").value = s.bgOpacity ?? 0.6;
    $("bg-opacity-val").textContent = Math.round(($("bg-opacity").value) * 100) + "%";

    setToggle("hide-original", s.hideOriginal !== false);
    setToggle("pause-on-hover", s.pauseOnHover !== false);
    setToggle("first-on-pause", !!s.firstOnPause);
    setToggle("secondary-on-pause", !!s.secondaryOnPause);
    setToggle("enabled", s.enabled !== false);

    $("default-primary-lang").value = s.defaultPrimaryLang || "";
    $("default-secondary-lang").value = s.defaultSecondaryLang || "";

    [$("primary-size"), $("secondary-size"), $("bg-opacity")].forEach(updateRangeFill);
  }

  function setTracks(newTracks) {
    tracks = newTracks || [];

    [$("primary-select"), $("secondary-select")].forEach(sel => {
      const prev = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      tracks.forEach(t => sel.appendChild(new Option(t.label, t.url)));
      if (tracks.some(t => t.url === prev)) sel.value = prev;
    });

    setSettings(currentSettings);
  }

  let statusTimer = null;
  function showStatus(msg, { persist = false } = {}) {
    const el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("jf-hidden");
    clearTimeout(statusTimer);
    if (!persist) {
      statusTimer = setTimeout(() => el.classList.add("jf-hidden"), 3000);
    }
  }

  function hideStatus() {
    const el = $("status");
    if (el) el.classList.add("jf-hidden");
  }

  let savedTimer = null;
  function flashSaved() {
    const el = root.querySelector("#jfds-save-toast");
    if (!el) return;
    el.classList.remove("jf-hidden");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.add("jf-hidden"), 1400);
  }

  function destroy() {
    cleanupFns.forEach(fn => fn());
  }

  return { setSettings, setTracks, showStatus, hideStatus, flashSaved, destroy };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = mountPanel;
}
