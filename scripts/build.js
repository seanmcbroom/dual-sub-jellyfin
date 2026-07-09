#!/usr/bin/env node
// scripts/build.js — bundles the extension for Chrome and/or Firefox

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const browserArg = args.find(a => a.startsWith("--browser="));
const browser = browserArg ? browserArg.split("=")[1] : "all";

const browsers = browser === "all" ? ["chrome", "firefox"] : [browser];

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const MANIFESTS = path.join(ROOT, "manifests");

async function buildForBrowser(target) {
  const outDir = path.join(ROOT, "dist", target);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "icons"), { recursive: true });

  // Bundle content script (parser + content + shared panel)
  await esbuild.build({
    entryPoints: [path.join(SRC, "content", "index.js")],
    bundle: true,
    outfile: path.join(outDir, "src", "content.bundle.js"),
    format: "iife",
    target: "es2020",
  });

  // Bundle popup script (shared panel template/controller)
  await esbuild.build({
    entryPoints: [path.join(SRC, "popup", "popup.js")],
    bundle: true,
    outfile: path.join(outDir, "src", "popup.bundle.js"),
    format: "iife",
    target: "es2020",
  });

  // Copy background (no bundling needed — single file, no imports)
  fs.copyFileSync(
    path.join(SRC, "background", "index.js"),
    path.join(outDir, "src", "background.js")
  );

  // Copy popup shell (HTML + popup-specific chrome CSS; logic is bundled above)
  for (const f of ["popup.html", "popup.css"]) {
    fs.copyFileSync(path.join(SRC, "popup", f), path.join(outDir, "src", f));
  }

  // Copy overlay CSS (subtitle lines) and shared panel CSS (settings UI,
  // used by both the popup and the in-player panel)
  fs.copyFileSync(
    path.join(SRC, "content", "overlay.css"),
    path.join(outDir, "src", "overlay.css")
  );
  fs.copyFileSync(
    path.join(SRC, "shared", "panel.css"),
    path.join(outDir, "src", "panel.css")
  );

  // Copy icons
  for (const icon of ["icon16.png", "icon48.png", "icon128.png"]) {
    fs.copyFileSync(
      path.join(ROOT, "icons", icon),
      path.join(outDir, "icons", icon)
    );
  }

  // Copy the right manifest
  fs.copyFileSync(
    path.join(MANIFESTS, `manifest.${target}.json`),
    path.join(outDir, "manifest.json")
  );

  console.log(`✓ Built for ${target} → dist/${target}/`);
}

(async () => {
  for (const b of browsers) {
    await buildForBrowser(b);
  }
})();
