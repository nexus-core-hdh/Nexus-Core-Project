// Clipboard fallback (lib/clipboard.ts): pages opened over plain http on the office network have no
// navigator.clipboard, and every Copy button threw "Cannot read properties of undefined (reading
// 'writeText')". Driven with a fake document/navigator — no browser needed.
//   Run: npm run test:clipboard
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const { installClipboardFallback, legacyCopy } = await import("@/lib/clipboard");

/** A minimal document: records textareas, and execCommand("copy") returns `copies`. */
function fakeDoc({ copies = true, inDialog = false } = {}) {
  const log = { appendedTo: null, removed: 0, selected: 0, copied: [] };
  const dialog = { tag: "dialog", appendChild(el) { log.appendedTo = "dialog"; el._host = this; } };
  const body = { tag: "body", appendChild(el) { log.appendedTo = "body"; el._host = this; } };
  const active = { focus() {}, closest: (sel) => (inDialog && sel === '[role="dialog"]' ? dialog : null) };
  let lastValue = "";
  return {
    log,
    body,
    activeElement: active,
    createElement: () => ({
      value: "", style: {}, setAttribute() {}, focus() {}, select() { log.selected++; lastValue = this.value; }, remove() { log.removed++; },
    }),
    execCommand(cmd) { if (cmd === "copy" && copies) log.copied.push(lastValue); return cmd === "copy" && copies; },
  };
}

describe("clipboard fallback", () => {
  it("adds navigator.clipboard.writeText only where the browser has none (plain-http LAN page)", async () => {
    const nav = {};
    const doc = fakeDoc();
    assert.equal(installClipboardFallback(nav, doc), true);
    await nav.clipboard.writeText("Tmp-Pass-12345");
    assert.deepEqual(doc.log.copied, ["Tmp-Pass-12345"]);
    assert.equal(doc.log.removed, 1, "the temporary textarea is removed");
    assert.equal(installClipboardFallback(nav, doc), false, "idempotent");
  });

  it("keeps the browser's own clipboard on https/localhost", () => {
    const own = { writeText: async () => {} };
    const nav = { clipboard: own };
    assert.equal(installClipboardFallback(nav, fakeDoc()), false);
    assert.equal(nav.clipboard, own);
  });

  it("rejects (never throws synchronously) when the browser refuses to copy", async () => {
    const nav = {};
    installClipboardFallback(nav, fakeDoc({ copies: false }));
    let p;
    assert.doesNotThrow(() => { p = nav.clipboard.writeText("x"); });
    await assert.rejects(p, /not available/);
  });

  it("copies from inside an open dialog (focus-trapped) by placing the textarea in that dialog", () => {
    const doc = fakeDoc({ inDialog: true });
    assert.equal(legacyCopy("secret", doc), true);
    assert.equal(doc.log.appendedTo, "dialog");
    const outside = fakeDoc();
    legacyCopy("x", outside);
    assert.equal(outside.log.appendedTo, "body");
  });

  it("is installed app-wide, and the one-time password's Copy reports failure instead of crashing", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.ok(layout.includes("<ClipboardFallback />"));
    const dialog = readFileSync(new URL("../app/[company]/(auth)/pages/users/create-user-dialog.tsx", import.meta.url), "utf8");
    assert.ok(!dialog.includes("navigator.clipboard.writeText(createdUserPassword)"), "no unguarded call");
    assert.ok(dialog.includes("if (await copyText(createdUserPassword)) {"));
    assert.ok(dialog.includes("press Ctrl+C to copy it"));
  });
});
