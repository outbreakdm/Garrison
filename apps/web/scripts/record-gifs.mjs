// Records the landing page's "Watch it work" GIFs from the dashboard on a local test server.
// Headless Chrome over the DevTools protocol takes PNG frames; sharp (Next's own copy) joins
// them into looping GIFs, with a still of the last frame for reduced motion.
//
//   GARRISON_SESSION=<a local session token> node scripts/record-gifs.mjs [fixit|preview|saves|all]
//
// Needs the local preview (BASE_URL, default http://localhost:3100) seeded with the test server
// (GUILD, default 111111111111111111). Each scene puts the test data back when it's done; the
// Suggestions channel goes back through psql in GIF_DB_CONTAINER (default garrison-design-pg).
// The signed-in name is swapped for "mira" in every frame: these go on the public site.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const GUILD = process.env.GUILD ?? "111111111111111111";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DB = process.env.GIF_DB_CONTAINER ?? "garrison-design-pg";
const PORT = 9333;
const scene = process.argv[2] ?? "all";
const OUT = process.argv[3] ?? join(process.cwd(), "public", "media");
mkdirSync(OUT, { recursive: true });
const token = process.env.GARRISON_SESSION?.trim();
if (!token) throw new Error("Set GARRISON_SESSION to a local session token.");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Chrome and a tiny CDP client -------------------------------------------------------
const profile = join(tmpdir(), "garrison-gif-chrome");
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1280,900",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const stop = () => {
  try {
    chrome.kill();
  } catch {}
};
process.on("exit", stop);

async function pageSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome didn't start");
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.wait = new Map();
    this.ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString());
      if (m.id && this.wait.has(m.id)) {
        const { ok, bad } = this.wait.get(m.id);
        this.wait.delete(m.id);
        m.error ? bad(new Error(`${m.error.message}`)) : ok(m.result);
      }
    };
  }
  open() {
    return new Promise((ok) => (this.ws.onopen = ok));
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, bad) => {
      this.wait.set(id, { ok, bad });
      // A call that never answers (a page mid-navigation) fails instead of hanging the run.
      setTimeout(() => {
        if (!this.wait.has(id)) return;
        this.wait.delete(id);
        bad(new Error(`timeout: ${method}`));
      }, 12000);
    });
  }
}

const cdp = new CDP(await pageSocket());
await cdp.open();
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCookie", {
  name: "garrison_session",
  value: token,
  domain: "localhost",
  path: "/",
  httpOnly: true,
});

async function viewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function js(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      `${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`,
    );
  return r.result.value;
}

/** Load a page and wait for it to be interactive (hydrated: a self-saving panel is live). */
async function goto(path, ready) {
  await cdp.send("Page.navigate", { url: `${BASE}${path}` });
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const ok = await js(
      `document.readyState === "complete" && !!document.querySelector(${JSON.stringify(ready)})`,
    ).catch(() => false);
    if (ok) break;
  }
  await sleep(1800);
  await js(INJECT);
}

// The recording's cursor, and the test account's name swapped for a placeholder: the GIFs go
// on the public site. Styles go through the CSSOM (the page's CSP allows that).
const INJECT = `(() => {
  if (window.__gif) return;
  const c = document.createElement("div");
  c.innerHTML = '<svg viewBox="0 0 16 20" width="20" height="25"><path d="M1 1v15l4-4 3 6 3-1.5-3-6h5.5z" fill="#fff" stroke="#0b0d10" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  const s = c.style;
  s.position = "fixed"; s.left = "0"; s.top = "0"; s.zIndex = "2147483647"; s.pointerEvents = "none";
  s.filter = "drop-shadow(0 2px 3px rgba(0,0,0,.55))";
  s.transition = "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";
  s.transform = "translate(" + (window.__start?.[0] ?? 900) + "px," + (window.__start?.[1] ?? 520) + "px)";
  document.body.appendChild(c);
  // Whoever is signed in (read from the top bar, once) shows as "mira" in every frame.
  window.__me ??= document.querySelector(".topbar__name")?.textContent.trim() || "";
  const me = window.__me;
  const fix = (n) => {
    if (me && n.nodeType === 3 && n.nodeValue.includes(me)) n.nodeValue = n.nodeValue.split(me).join("mira");
  };
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) fix(n);
    root.querySelectorAll?.(".topbar__user *").forEach((e) => {
      if (me && e.childElementCount === 0 && e.textContent === me[0].toUpperCase()) e.textContent = "M";
    });
  };
  walk(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") fix(m.target);
      for (const n of m.addedNodes) n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  window.__gif = {
    move(x, y) { s.transform = "translate(" + x + "px," + y + "px)"; },
    press() { c.animate([{ scale: 1 }, { scale: 0.8 }, { scale: 1 }], { duration: 260 }); },
  };
})()`;

/** Center of the first element matching a test, in viewport coordinates. */
async function center(expr) {
  return js(`(() => {
    const el = ${expr};
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  })()`);
}

async function moveTo(expr, settle = 750) {
  const p = await center(expr);
  if (!p) throw new Error(`not found: ${expr}`);
  await js(`window.__gif.move(${p[0] - 3}, ${p[1] - 2})`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p[0], y: p[1] });
  await sleep(settle);
  return p;
}

async function click(p) {
  await js("window.__gif.press()");
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: p[0],
    y: p[1],
    button: "left",
    clickCount: 1,
  });
  await sleep(70);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: p[0],
    y: p[1],
    button: "left",
    clickCount: 1,
  });
}

async function typeText(text, perChar = 70) {
  for (const ch of text) {
    await cdp.send("Input.insertText", { text: ch });
    await sleep(perChar);
  }
}

async function selectAll() {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    commands: ["selectAll"],
  });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
}

// --- Frames ------------------------------------------------------------------------------
let frames = [];
let recording = false;
let loopDone = Promise.resolve();
function startRecording(clip, every = 90) {
  recording = true;
  loopDone = (async () => {
    while (recording) {
      const t0 = Date.now();
      try {
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          clip: { ...clip, scale: 1 },
          optimizeForSpeed: true,
        });
        frames.push({ buf: Buffer.from(data, "base64"), t: t0 });
      } catch {}
      await sleep(Math.max(0, every - (Date.now() - t0)));
    }
  })();
}
async function pauseRecording() {
  recording = false;
  await loopDone;
}

async function writeGif(name, width, holdEnd = 1600) {
  // Identical neighbours become one longer frame.
  const kept = [];
  for (const f of frames) {
    const last = kept.at(-1);
    if (last?.buf.equals(f.buf)) continue;
    kept.push(f);
  }
  const delays = kept.map((f, i) => {
    const next = kept[i + 1];
    return next ? Math.max(40, next.t - f.t) : holdEnd;
  });
  // Gaps from page loads (recording paused) collapse to a short cut.
  for (let i = 0; i < delays.length; i++)
    if (delays[i] > 2500 && i < delays.length - 1) delays[i] = 350;
  const resized = await Promise.all(
    kept.map((f) => sharp(f.buf).resize({ width }).png().toBuffer()),
  );
  const file = join(OUT, `${name}.gif`);
  await sharp(resized, { join: { animated: true } })
    .gif({ loop: 0, delay: delays, effort: 8, colours: 128, dither: 0.3 })
    .toFile(file);
  // A still of the end state, for people who ask for less motion.
  await sharp(kept.at(-1).buf)
    .resize({ width })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, `${name}.png`));
  const meta = await sharp(file, { animated: true }).metadata();
  const total = delays.reduce((a, b) => a + b, 0);
  console.log(
    `${name}: ${meta.pages} frames, ${meta.width}x${meta.pageHeight}, ${(total / 1000).toFixed(1)} s, ${(statSync(file).size / 1024).toFixed(0)} KB`,
  );
  frames = [];
}

// --- Scenes ------------------------------------------------------------------------------

/** See what needs you, fix it there: Overview → Suggestions → pick a channel → it works. */
async function fixit() {
  await viewport(1280, 800);
  await goto(`/servers/${GUILD}`, ".attention__item");
  const clip = { x: 0, y: 0, width: 1280, height: 800 };
  startRecording(clip);
  await sleep(1300);
  const go = await moveTo(
    `[...document.querySelectorAll("a.attention__item")].find((a) => a.textContent.includes("Suggestions"))?.querySelector(".attention__go")`,
  );
  await sleep(250);
  await pauseRecording();
  await click(go);
  // Wait for Suggestions, then carry on from the same spot.
  await js(`window.__start = [${go[0]}, ${go[1]}]`).catch(() => {});
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const there = await js(
      `location.pathname.endsWith("/suggestions") && document.readyState === "complete" && !!document.querySelector("#settings[data-live]")`,
    ).catch(() => false);
    if (there) break;
  }
  await sleep(1500);
  await js(`window.__start = [${go[0]}, ${go[1]}]`);
  await js(INJECT);
  startRecording(clip);
  await sleep(1400);
  const sel = await moveTo(`document.querySelector("#settings select#channelId")`);
  await sleep(200);
  await click(sel);
  await sleep(500);
  // Pick the first real channel (the native dropdown doesn't render in a capture).
  await js(`(() => {
    const s = document.querySelector("#settings select#channelId");
    const opt = [...s.options].find((o) => o.value);
    s.value = opt.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  // Close the open dropdown, as picking an option would.
  await sleep(450);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await js(`document.activeElement?.blur()`);
  await moveTo(`document.querySelector(".page-head .head-state")`, 400);
  await sleep(3600);
  await pauseRecording();
  await writeGif("garrison-fix-it", 960, 2200);
  // Put the test server back (no channel). The form won't save "on with no channel", so
  // this goes straight to the local test database.
  execSync(
    `docker exec ${DB} psql -U postgres -At -c "update suggestion_settings set channel_id = null where guild_id='${GUILD}'"`,
  );
}

/** Write it, see it: the welcome card's preview follows every key. */
async function preview() {
  await viewport(1280, 1000);
  await goto(`/servers/${GUILD}/herald`, "#join[data-live]");
  const rect = await js(`(() => {
    const r = document.querySelector("#join").getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, 560)) };
  })()`);
  const titleSel = `document.querySelector("#join input[id$='-title']")`;
  const original = await js(`${titleSel}.value`);
  startRecording(rect, 80);
  await sleep(1200);
  const t = await moveTo(titleSel);
  await click(t);
  await sleep(250);
  await selectAll();
  await sleep(250);
  await typeText("Welcome to the squad, {user}!", 75);
  await sleep(3200);
  await pauseRecording();
  await writeGif("garrison-live-preview", 960, 2400);
  // Back to how it was.
  await click(t);
  await selectAll();
  await cdp.send("Input.insertText", { text: original });
  await sleep(3000);
}

/** Settings save themselves: a preset fills the numbers, Use it goes back. */
async function saves() {
  await viewport(1280, 900);
  await goto(`/servers/${GUILD}/watch`, "#automod[data-live]");
  const rect = await js(`(() => {
    const p = document.querySelector("#automod").getBoundingClientRect();
    const row = document.querySelector("#spamCount").closest(".field-row").getBoundingClientRect();
    return { x: Math.round(p.left), y: Math.round(p.top), width: Math.round(p.width), height: Math.round(row.bottom - p.top + 16) };
  })()`);
  const card = (label) =>
    `[...document.querySelectorAll("#automod .pick-card")].find((c) => c.querySelector(".pick-card__name")?.textContent.startsWith("${label}"))`;
  startRecording(rect, 80);
  await sleep(1200);
  const strict = await moveTo(card("Strict"));
  await click(strict);
  await sleep(2800);
  const use = await moveTo(`document.querySelector("#automod fieldset .rec-value__go")`);
  await sleep(200);
  await click(use);
  await sleep(2800);
  await pauseRecording();
  await writeGif("garrison-saves-itself", 900, 2400);
}

try {
  if (scene === "fixit" || scene === "all") await fixit();
  if (scene === "preview" || scene === "all") await preview();
  if (scene === "saves" || scene === "all") await saves();
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  stop();
  process.exit();
}
