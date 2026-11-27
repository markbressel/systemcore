// README screenshots from the real app: `npm run screenshots`.
// Starts `tauri dev` with WebView2 remote debugging, walks every page, tab, settings section, the 3D lighting
// steps in English at a fixed size, saves docs/screenshots/<name>.png, then restores the
// language and closes the app. Best run as administrator (CPU temperature, RAM lighting) on a PC with RGB devices.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9333; // 9222 is often taken by other WebView2/Chromium apps
const SIZE = { width: 1600, height: 1000 };
const OUT = "docs/screenshots";

// Browser-side helpers (run inside the app page).
const nav = (label) => `document.querySelector('.sidebar__navigation button[aria-label="${label}"]')?.click()`;
const tab = (text) => `[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`;
const hotspot = (text) => `[...document.querySelectorAll('.hotspot')].find((b) => b.querySelector('.hotspot__label')?.textContent.trim() === ${JSON.stringify(text)})?.click()`;
// React-controlled input: set the value through the native setter so React sees it, then submit its form.
const search = (selector, text) => `(() => { const i = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event("input", { bubbles: true })); i.form.requestSubmit(); })()`;
const scroll = (to) => `[...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach((e) => e.scrollTo(0, ${to === "bottom" ? "e.scrollHeight" : "0"}))`;

/** [file, steps to run before the shot, settle time in ms] — every page, tab and section of the app. */
const SHOTS = [
  ["overview", [nav("Overview")], 2500],
  ["overview-details", [scroll("bottom")], 1200],
  ["performance", [nav("Performance"), tab("CPU")], 2500],
  ["performance-memory", [tab("Memory")], 2000],
  ["performance-gpu", [tab("GPU")], 2000],
  ["history", [nav("History")], 2500],
  ["processes", [nav("Processes")], 2500],
  ["hardware", [nav("Hardware")], 3000],
  ["storage", [nav("Storage")], 2500],
  ["network", [nav("Network")], 2500],
  ["lighting", [nav("PC lighting")], 4500],
  ["lighting-open", [hotspot("Open the PC")], 2500],
  ["lighting-part", [hotspot("Memory")], 2500],
  ["peripherals", [nav("Peripherals")], 4500],
  ["peripherals-device", [hotspot("Mouse")], 2500],
  ["display", [nav("Display")], 2500],
  ["speedtest", [nav("Speed Test")], 2000],
  ["benchmark", [nav("Benchmark")], 2000],
  // Steps may be promises (awaited): wait for the Steam results before scrolling to them.
  [
    "benchmark-games",
    [
      nav("Benchmark"),
      "new Promise((r) => setTimeout(r, 1500))",
      search(".game-search__form input", "Elden Ring"),
      "new Promise((r) => setTimeout(r, 6000))",
      "document.querySelector('.game-search__hits button')?.click()",
      "new Promise((r) => setTimeout(r, 6000))",
      "document.querySelector('.game-search__head')?.scrollIntoView({ block: 'start' })",
    ],
    1500,
  ],
  ["startup", [nav("Startup Apps")], 2500],
  ["updater", [nav("Updater")], 30000],
  ["loadout", [nav("Loadout")], 15000],
  ["news", [nav("News")], 5000],
  ["about", [nav("About")], 2500],
  ["settings", [nav("Settings"), tab("Startup & tray")], 2000],
  ["settings-overlay", [tab("Overlay")], 1500],
  ["settings-alerts", [tab("Alerts")], 1500],
  ["settings-gaming", [tab("Gaming")], 1500],
  ["settings-appearance", [tab("Appearance")], 1500],
];

// `ONLY=benchmark-games,news npm run screenshots` retakes just those shots.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tauri passes its own WebView2 arguments (the env variable would be ignored), so add the debug port through a
// config override of the windows, keeping Tauri's default arguments.
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8").replace(/^﻿/, ""));
const args = `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=${PORT}`;
const override = join(tmpdir(), "systemcore-screenshots.conf.json");
writeFileSync(override, JSON.stringify({ app: { windows: conf.app.windows.map((w) => ({ ...w, additionalBrowserArgs: args })) } }));
const app = spawn(`npm run tauri dev -- --config "${override}"`, { shell: true, stdio: "ignore" });
const stopApp = () => {
  try {
    execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" });
  } catch {
    // already gone
  }
};

/** Minimal DevTools protocol client over the built-in WebSocket. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)));
  let next = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++next;
      waiting.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
  return { send, run, close: () => ws.close() };
}

/** SystemCore's windows: the main one has the sidebar, the overlay does not. */
async function findWindow(main, tries = 600) {
  for (let i = 0; i < tries; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      for (const t of targets.filter((t) => t.type === "page" && t.url.includes("localhost:1420"))) {
        const c = await connect(t.webSocketDebuggerUrl);
        if ((await c.run("!!document.querySelector('.sidebar__navigation')")) === main) return c;
        c.close();
      }
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(main ? "SystemCore did not start with remote debugging" : "overlay window not found");
}

const shot = async (c, file) => {
  const { data } = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${file}.png`, Buffer.from(data, "base64"));
  console.log(`saved ${OUT}/${file}.png`);
};

const KEY = "systemcore.settings";
const setLanguage = (lang) => `(() => { const s = JSON.parse(localStorage.getItem("${KEY}") || "{}"); const before = s.appearance?.language ?? null;
  s.appearance = { ...s.appearance, language: ${JSON.stringify(lang)} }; if (s.appearance.language === null) delete s.appearance.language;
  localStorage.setItem("${KEY}", JSON.stringify(s)); return before; })()`;

try {
  let c = await findWindow(true);
  const original = await c.run(setLanguage("en"));
  await c.run("location.reload()");
  c.close();
  await sleep(3000);
  c = await findWindow(true);
  await c.send("Emulation.setDeviceMetricsOverride", { ...SIZE, deviceScaleFactor: 1, mobile: false });
  await sleep(9000); // ignition splash + first telemetry samples + device scan
  mkdirSync(OUT, { recursive: true });

  for (const [file, steps, settle] of SHOTS.filter(([f]) => !ONLY || ONLY.has(f))) {
    for (const s of steps) await c.run(s);
    await sleep(settle);
    if (!file.endsWith("-details") && !file.endsWith("-games")) await c.run(scroll("top"));
    await shot(c, file);
  }

  // The overlay window cannot open in this debug-port session (its WebView2 would need the same browser
  // arguments), so docs/screenshots/overlay.png is taken separately: normal start, Ctrl+Shift+O, screen capture.

  if (original !== "en") await c.run(setLanguage(original)); // null: back to "follow Windows"
  c.close();
} finally {
  stopApp();
}
