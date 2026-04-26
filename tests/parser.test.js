// tests/parser.test.js
"use strict";

const { parseSubtitles, findCue } = require("../src/content/parser");

// ── SRT ───────────────────────────────────────────────────────────────────────

describe("parseSRT", () => {
  const srt = `
1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:05,000 --> 00:00:07,000
Second line
`.trim();

  test("parses two cues", () => {
    const cues = parseSubtitles(srt, "sub.srt");
    expect(cues).toHaveLength(2);
  });

  test("parses start/end times correctly", () => {
    const [c1, c2] = parseSubtitles(srt, "sub.srt");
    expect(c1.start).toBe(1000);
    expect(c1.end).toBe(3500);
    expect(c2.start).toBe(5000);
    expect(c2.end).toBe(7000);
  });

  test("parses cue text", () => {
    const [c1] = parseSubtitles(srt, "sub.srt");
    expect(c1.text).toBe("Hello world");
  });

  test("strips HTML tags from text", () => {
    const tagged = `1\n00:00:01,000 --> 00:00:02,000\n<i>italic</i>`;
    const [cue] = parseSubtitles(tagged, "sub.srt");
    expect(cue.text).toBe("italic");
  });

  test("handles multi-line cue text", () => {
    const multi = `1\n00:00:01,000 --> 00:00:03,000\nLine one\nLine two`;
    const [cue] = parseSubtitles(multi, "sub.srt");
    expect(cue.text).toBe("Line one\nLine two");
  });
});

// ── VTT ───────────────────────────────────────────────────────────────────────

describe("parseVTT", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.500
Hello VTT

00:01:00.000 --> 00:01:02.000
With hours
`;

  test("parses two cues from VTT", () => {
    const cues = parseSubtitles(vtt);
    expect(cues).toHaveLength(2);
  });

  test("handles timestamps without hours", () => {
    const [c1] = parseSubtitles(vtt);
    expect(c1.start).toBe(1000);
    expect(c1.end).toBe(3500);
  });

  test("handles timestamps with hours", () => {
    const [, c2] = parseSubtitles(vtt);
    expect(c2.start).toBe(60000);
    expect(c2.end).toBe(62000);
  });

  test("is detected by WEBVTT header even without url", () => {
    const cues = parseSubtitles(vtt, "");
    expect(cues.length).toBeGreaterThan(0);
  });

  test("ignores NOTE blocks", () => {
    const withNote = `WEBVTT\n\nNOTE\nThis is a comment\n\n00:00:01.000 --> 00:00:02.000\nActual cue`;
    const cues = parseSubtitles(withNote);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Actual cue");
  });
});

// ── ASS ───────────────────────────────────────────────────────────────────────

describe("parseASS", () => {
  const ass = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginV, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0000,Hello ASS
Dialogue: 0,0:00:05.00,0:00:07.00,Default,,0000,{\\i1}Italic override{\\i0}
`;

  test("detects ASS by Script Info header", () => {
    const cues = parseSubtitles(ass, "");
    expect(cues.length).toBeGreaterThan(0);
  });

  test("detects ASS by .ass extension", () => {
    const cues = parseSubtitles(ass, "sub.ass");
    expect(cues.length).toBeGreaterThan(0);
  });

  test("parses start time", () => {
    const [c1] = parseSubtitles(ass);
    expect(c1.start).toBe(1000);
  });

  test("parses end time", () => {
    const [c1] = parseSubtitles(ass);
    expect(c1.end).toBe(3500);
  });

  test("strips ASS override tags", () => {
    const [, c2] = parseSubtitles(ass);
    expect(c2.text).toBe("Italic override");
  });

  test("sorts cues by start time", () => {
    // Reverse order in source
    const reversed = `[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginV, Text\nDialogue: 0,0:00:05.00,0:00:07.00,Default,,0000,Second\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0000,First\n`;
    const cues = parseSubtitles(reversed);
    expect(cues[0].text).toBe("First");
    expect(cues[1].text).toBe("Second");
  });

  test("converts ASS centiseconds correctly", () => {
    // 0:00:01.50 = 1 second + 50 centiseconds = 1500ms
    const precise = `[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginV, Text\nDialogue: 0,0:00:01.50,0:00:02.00,Default,,0000,Precise\n`;
    const [cue] = parseSubtitles(precise);
    expect(cue.start).toBe(1500);
  });
});

// ── findCue ───────────────────────────────────────────────────────────────────

describe("findCue", () => {
  const cues = [
    { start: 1000, end: 3000, text: "first" },
    { start: 5000, end: 7000, text: "second" },
    { start: 9000, end: 11000, text: "third" },
  ];

  test("returns null for empty cue list", () => {
    expect(findCue([], 1000)).toBeNull();
  });

  test("finds cue at exact start time", () => {
    expect(findCue(cues, 1000)?.text).toBe("first");
  });

  test("finds cue mid-duration", () => {
    expect(findCue(cues, 2000)?.text).toBe("first");
  });

  test("finds cue at exact end time", () => {
    expect(findCue(cues, 3000)?.text).toBe("first");
  });

  test("returns null between cues", () => {
    expect(findCue(cues, 4000)).toBeNull();
  });

  test("finds last cue", () => {
    expect(findCue(cues, 10000)?.text).toBe("third");
  });

  test("returns null before all cues", () => {
    expect(findCue(cues, 500)).toBeNull();
  });

  test("returns null after all cues", () => {
    expect(findCue(cues, 99999)).toBeNull();
  });
});

// ── Format auto-detection ─────────────────────────────────────────────────────

describe("format auto-detection", () => {
  test("defaults to SRT when no signals present", () => {
    const srt = `1\n00:00:01,000 --> 00:00:02,000\nSRT default`;
    const cues = parseSubtitles(srt, "unknown.txt");
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("SRT default");
  });

  test("detects ASS by .ssa extension", () => {
    const ass = `[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginV, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0000,SSA\n`;
    const cues = parseSubtitles(ass, "sub.ssa");
    expect(cues).toHaveLength(1);
  });
});
