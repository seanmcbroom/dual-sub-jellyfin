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

// ── SRT ──────────────────────────────────────────────────────────────────────
function parseSRT(raw) {
  console.log("[DualSubs][Parser][SRT] Parsing SRT");

  const cues = [];
  const blocks = raw.split(/\n\s*\n/);

  console.log("[DualSubs][Parser][SRT] Blocks found:", blocks.length);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const tcIndex = lines.findIndex(l => l.includes("-->"));
    if (tcIndex === -1) continue;

    try {
      const [startStr, endStr] = lines[tcIndex].split("-->").map(s => s.trim());
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
    return (h * 3600 + m * 60 + s) * 1000 + Number(ms);
  } catch (e) {
    console.warn("[DualSubs][Parser] Bad SRT timestamp:", t);
    return 0;
  }
}

// ── VTT ──────────────────────────────────────────────────────────────────────
function parseVTT(raw) {
  console.log("[DualSubs][Parser][VTT] Parsing VTT");

  const cues = [];
  const blocks = raw.split(/\n\s*\n/);

  console.log("[DualSubs][Parser][VTT] Blocks found:", blocks.length);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const tcIndex = lines.findIndex(l => l.includes("-->"));
    if (tcIndex === -1) continue;

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
    return (Number(h) * 3600 + Number(m) * 60 + Number(sec)) * 1000 +
      Number((ms || "0").padEnd(3, "0"));
  } catch (e) {
    console.warn("[DualSubs][Parser] Bad VTT timestamp:", t);
    return 0;
  }
}

// ── ASS / SSA ────────────────────────────────────────────────────────────────
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

    if (!inEvents) continue;

    if (trimmed.startsWith("Format:")) {
      formatFields = trimmed.slice(7).split(",").map(f => f.trim().toLowerCase());
      console.log("[DualSubs][Parser][ASS] Format fields:", formatFields);
      continue;
    }

    if (trimmed.startsWith("Dialogue:")) {
      try {
        const values = trimmed.slice(9).split(",");

        const get = (key) => {
          const i = formatFields.indexOf(key);
          if (i === -1) return "";
          if (key === "text") return values.slice(i).join(",").trim();
          return (values[i] || "").trim();
        };

        const start = assTimeToMs(get("start"));
        const end = assTimeToMs(get("end"));
        const text = stripASSOverrides(get("text"));

        if (text) cues.push({ start, end, text });
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
    return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(cs) * 10;
  } catch (e) {
    console.warn("[DualSubs][Parser] Bad ASS timestamp:", t);
    return 0;
  }
}

function stripASSOverrides(text) {
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\n/gi, "\n")
    .trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripTags(text) {
  return text.replace(/<[^>]*>/g, "").trim();
}

// ── Cue lookup ────────────────────────────────────────────────────────────────
function findCue(cues, timeMs) {
  if (!cues.length) {
    console.log("[DualSubs][Parser] findCue called with empty cues");
    return null;
  }

  let lo = 0;
  let hi = cues.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
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