// src/content/parser.js
// Parses SRT, VTT, and ASS/SSA subtitle files into cue objects.
// Each cue: { start: number, end: number, text: string } (times in ms)

// ── Entry point ───────────────────────────────────────────────────────────────

function parseSubtitles(raw, url = "") {
  const trimmed = raw.trim();

  if (url.endsWith(".ass") || url.endsWith(".ssa") || trimmed.startsWith("[Script Info]")) {
    return parseASS(trimmed);
  }

  if (trimmed.startsWith("WEBVTT")) {
    return parseVTT(trimmed);
  }

  return parseSRT(trimmed);
}

// ── SRT ───────────────────────────────────────────────────────────────────────

function parseSRT(raw) {
  const cues = [];
  const blocks = raw.split(/\n\s*\n/);

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

// ── VTT ───────────────────────────────────────────────────────────────────────

function parseVTT(raw) {
  const cues = [];
  const blocks = raw.split(/\n\s*\n/);

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

// ── ASS / SSA ─────────────────────────────────────────────────────────────────

function parseASS(raw) {
  const cues = [];
  let inEvents = false;
  let formatFields = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "[Events]") {
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

module.exports = { parseSubtitles, findCue };
