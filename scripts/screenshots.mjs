/**
 * Screenshots the app with headless Chrome over the DevTools Protocol.
 * Avoids adding Playwright (~300MB) as a dependency for a one-off task.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(ROOT, "docs", "screenshots");
const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const PORT = 9333;

const demo = JSON.parse(fs.readFileSync(process.env.DEMO_JSON ?? path.join(ROOT, "scripts", ".demo.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const profile = path.join(process.env.TEMP ?? "/tmp", `chrome-shots-${Date.now()}`);

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--headless=new",
  "--hide-scrollbars",
  "--disable-gpu",
  "--no-first-run",
  "--force-device-scale-factor=2", // retina-quality output
  "about:blank",
], { stdio: "ignore" });

async function cdpTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome not up yet.
    }
    await sleep(250);
  }
  throw new Error("Chrome did not expose a debugging target");
}

const wsUrl = await cdpTarget();

// Minimal CDP client over the raw WebSocket — no dependency needed.
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 1;
const pending = new Map();
const listeners = new Map();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method && listeners.has(msg.method)) {
    listeners.get(msg.method).forEach((fn) => fn(msg.params));
  }
};

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function on(method, fn) {
  if (!listeners.has(method)) listeners.set(method, []);
  listeners.get(method).push(fn);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

// Plant the session cookies so the dashboard renders as a signed-in user.
const host = new URL(BASE).hostname;
for (const [name, value] of demo.cookies) {
  await send("Network.setCookie", { name, value, domain: host, path: "/" });
}

async function navigate(url) {
  const loaded = new Promise((resolve) => {
    const off = (params) => {
      if (params) resolve();
    };
    on("Page.loadEventFired", off);
  });
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000)]);
  // Let fonts settle and any entry animation finish.
  await sleep(1200);
}

async function setTheme(theme) {
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem('theme', '${theme}');
      document.documentElement.classList.toggle('dark', ${theme === "dark"});
    `,
  });
}

async function shoot(name, { width = 1440, height = 900, full = false } = {}) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width < 500,
  });
  await sleep(600);

  const params = { format: "png", captureBeyondViewport: full };
  if (full) {
    const { cssContentSize } = await send("Page.getLayoutMetrics");
    params.clip = {
      x: 0,
      y: 0,
      width: cssContentSize.width,
      height: Math.min(cssContentSize.height, 4000),
      scale: 1,
    };
  }

  const { data } = await send("Page.captureScreenshot", params);
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  ${name}.png  ${width}x${height}${full ? " (full page)" : ""}  ${kb}KB`);
}

console.log("Capturing screenshots...");

await navigate(`${BASE}/`);
await setTheme("light");
await navigate(`${BASE}/`);
await shoot("01-landing", { full: true });

await navigate(`${BASE}/dashboard`);
await shoot("02-dashboard");

await navigate(`${BASE}/dashboard/reviews/${demo.review2}`);
await shoot("03-review", { full: true });

await navigate(`${BASE}/dashboard/reviews`);
await shoot("04-history");

await navigate(`${BASE}/dashboard/compare?a=${demo.review1}&b=${demo.review2}`);
await shoot("07-compare", { full: true });

// Dark mode, to show the theme actually works.
await setTheme("dark");
await navigate(`${BASE}/dashboard/reviews/${demo.review2}`);
await shoot("05-review-dark", { full: true });

// Mobile, at the 360px width the requirements call for.
await setTheme("light");
await navigate(`${BASE}/dashboard/reviews/${demo.review2}`);
await shoot("06-mobile", { width: 360, height: 780, full: true });

ws.close();
chrome.kill();
console.log("\nDone.");
