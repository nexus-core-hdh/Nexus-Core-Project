// Real-browser component tests without extra dependencies: bundles a TSX entry (the app's own
// components, `@/` alias, node_modules) with the project's TypeScript into one script, loads it in a
// headless Chrome/Edge, and drives it over the DevTools protocol with real mouse/keyboard input — so
// focus, blur, mousedown and click behave exactly as in the app. Used by *.browser.test.mjs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFrontend = createRequire(path.join(FRONTEND, "package.json"));

const probe = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find((f) => existsSync(f) && !f.endsWith(path.sep) && /\.[cm]?[jt]sx?$/.test(f));

/**
 * One CommonJS bundle for `entry`. `stubs` maps an import specifier to CommonJS source used instead;
 * `overrides` maps an app file (absolute path) to replacement source (e.g. an older version from git).
 */
export function bundle(entry, { stubs = {}, overrides = {} } = {}) {
  const modules = new Map(); // id -> { code, deps: { spec: id } }
  const add = (id, file, code) => {
    if (modules.has(id)) return id;
    const mod = { code: "", deps: {} };
    modules.set(id, mod);
    let src = code ?? overrides[file] ?? readFileSync(file, "utf8");
    if (/\.tsx?$/.test(file)) {
      src = ts.transpileModule(src, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    }
    mod.code = src;
    for (const [, spec] of src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) mod.deps[spec] = resolve(spec, file);
    return id;
  };
  const resolve = (spec, from) => {
    if (stubs[spec] !== undefined) return add(`stub:${spec}`, `stub:${spec}`, stubs[spec]);
    let file;
    if (spec.startsWith("@/")) file = probe(path.join(FRONTEND, spec.slice(2)));
    else if (spec.startsWith(".")) file = probe(path.resolve(path.dirname(from), spec));
    else file = requireFromFrontend.resolve(spec, { paths: [path.dirname(from)] });
    if (!file) throw new Error(`browser-harness: cannot resolve "${spec}" from ${from}`);
    if (file.endsWith(".json")) return add(file, file, `module.exports = ${readFileSync(file, "utf8")};`);
    return add(file, file);
  };
  const entryId = add(entry, entry);
  const defs = [...modules].map(([id, m]) => `${JSON.stringify(id)}: [function (require, module, exports) {\n${m.code}\n}, ${JSON.stringify(m.deps)}]`);
  return `(function () {
var process = { env: { NODE_ENV: "development" } }; window.process = process;
var defs = {${defs.join(",\n")}}; var cache = {};
function load(id) {
  if (cache[id]) return cache[id].exports;
  var d = defs[id]; var module = cache[id] = { exports: {} };
  d[0].call(module.exports, function (spec) { return load(d[1][spec]); }, module, module.exports);
  return module.exports;
}
load(${JSON.stringify(entryId)});
})();`;
}

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
export const findBrowser = () => BROWSERS.find((b) => existsSync(b)) ?? null;

/** Opens `html` in a fresh headless browser profile; returns a small driver. Always call close(). */
export async function openPage(html) {
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome/Edge found (set CHROME_PATH).");
  const dir = mkdtempSync(path.join(os.tmpdir(), "browser-harness-"));
  const page = path.join(dir, "index.html");
  writeFileSync(page, html);
  const proc = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${path.join(dir, "profile")}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
  // Chrome writes this file once its DevTools port is open; on Windows it can still be locked
  // (EBUSY) or half-written right after it appears — retry until it reads as a port number.
  const portFile = path.join(dir, "profile", "DevToolsActivePort");
  let port = 0;
  for (let i = 0; i < 300 && !port; i++) {
    try { port = Number(readFileSync(portFile, "utf8").split("\n")[0]) || 0; } catch {}
    if (!port) await new Promise((r) => setTimeout(r, 50));
  }
  if (!port) { proc.kill(); throw new Error("browser-harness: the browser did not open its DevTools port"); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise((r, j) => {
    const id = ++seq;
    pending.set(id, (msg) => (msg.error ? j(new Error(`${method}: ${msg.error.message}`)) : r(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: pathToFileURL(page).href });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, { timeout = 5000, label = expression } = {}) => {
    const end = Date.now() + timeout;
    for (;;) {
      try { if (await evaluate(expression)) return; } catch {}
      if (Date.now() > end) throw new Error(`timed out waiting for: ${label}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** A real mouse click (move, press, release) at the centre of the first element matching the JS expression.
   *  `{ button: "right" }` right-clicks (opens context menus). */
  const click = async (elementExpression, { button = "left" } = {}) => {
    const rect = await evaluate(`(() => { const e = ${elementExpression}; if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 8) }; })()`);
    if (!rect) throw new Error(`click: no element for ${elementExpression}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button, clickCount: 1 });
  };
  const KEYS = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, Backspace: 8 };
  const press = async (key) => {
    const code = KEYS[key];
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
    if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", key, text: "\r", windowsVirtualKeyCode: code });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  };
  const type = async (text) => { for (const ch of text) await send("Input.insertText", { text: ch }); };
  const screenshot = async (file) => writeFileSync(file, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  const close = async () => {
    try { ws.close(); } catch {}
    proc.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { evaluate, waitFor, click, press, type, sleep, screenshot, close, consoleErrors, browser: exe };
}
