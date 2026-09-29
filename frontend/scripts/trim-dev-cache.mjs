#!/usr/bin/env node
// Keeps Turbopack's persistent dev cache (.next/dev) bounded. Turbopack never garbage-collects it:
// on this project it grew to ~33GB, and `next dev` (which memory-maps that cache) grew to ~9.5GB RAM
// until Next's dynamic-route worker could no longer fork ("Jest worker encountered 2 child process
// exceptions"). Called by dev-supervisor.mjs before every (re)start of `next dev`, and runnable by
// hand (`npm run dev:clean-cache`). A cache under the limit is kept so restarts stay fast.
//
// Environment (all optional):
//   DEV_CACHE_MAX_GB           wipe .next/dev when bigger than this.
//                              Default: RAM/4 clamped to 4..16 GB (16GB RAM -> 4, 32 -> 8, 64 -> 16).
//   DEV_CACHE_MIN_FREE_DISK_GB also wipe (if the cache is over 1GB) when the disk has less free
//                              space than this. Default 10. 0 disables.
//   DEV_CACHE_TRIM=0           never trim automatically.
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GB = 1024 ** 3;
const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = path.join(FRONTEND, ".next");
const DEV_CACHE = path.join(NEXT_DIR, "dev");
const LOCK = path.join(NEXT_DIR, "dev-cache-trim.lock");
const TRASH_PREFIX = "dev-trash-";
const LOCK_STALE_MS = 10 * 60 * 1000;

const log = (msg) => console.log(`[dev-cache] ${msg}`);
const fmt = (bytes) => `${(bytes / GB).toFixed(1)}GB`;
const envNumber = (name, fallback) => {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && process.env[name] !== "" && Number.isFinite(v) ? v : fallback;
};

export const defaultMaxBytes = () => Math.min(16, Math.max(4, os.totalmem() / GB / 4)) * GB;
const maxBytes = () => envNumber("DEV_CACHE_MAX_GB", defaultMaxBytes() / GB) * GB;

// Sums file sizes but stops as soon as `stopAt` is exceeded, so an oversized cache is detected
// without statting every file in it. Unreadable entries are skipped.
async function sizeUpTo(dir, stopAt) {
  let total = 0;
  const stack = [dir];
  while (stack.length && total <= stopAt) {
    let entries;
    try {
      entries = await fsp.readdir(stack.pop(), { withFileTypes: true });
    } catch {
      continue;
    }
    const files = [];
    for (const e of entries) {
      const full = path.join(e.parentPath ?? e.path, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(full);
    }
    const sizes = await Promise.all(files.map((f) => fsp.stat(f).then((s) => s.size, () => 0)));
    for (const s of sizes) total += s;
  }
  return total;
}

async function freeDiskBytes(dir) {
  try {
    const s = await fsp.statfs(dir);
    return s.bavail * s.bsize;
  } catch {
    return Infinity;
  }
}

const isPidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

// Exclusive lock so two trims (e.g. two terminals) never race on the same directory.
function acquireLock() {
  fs.mkdirSync(NEXT_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
      return () => fs.rmSync(LOCK, { force: true });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let stale = true;
      try {
        const { pid, at } = JSON.parse(fs.readFileSync(LOCK, "utf8"));
        stale = Date.now() - at > LOCK_STALE_MS || !isPidAlive(pid);
      } catch {}
      if (!stale) return null;
      fs.rmSync(LOCK, { force: true });
    }
  }
  return null;
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(1000);
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.once("timeout", () => (s.destroy(), resolve(false)));
  });

// Deletes leftover trash dirs from earlier trims. Returns a promise so callers can choose to wait.
function purgeTrash() {
  let names = [];
  try {
    names = fs.readdirSync(NEXT_DIR).filter((n) => n.startsWith(TRASH_PREFIX));
  } catch {}
  return Promise.all(
    names.map((n) =>
      fsp.rm(path.join(NEXT_DIR, n), { recursive: true, force: true, maxRetries: 3 }).catch((e) => {
        log(`could not delete ${n} yet (${e.code || e.message}); will retry next start`);
      })
    )
  );
}

/**
 * Trims .next/dev if it is over the limit (or the disk is nearly full).
 * The cache is renamed away first (instant), so `next dev` can start immediately; the returned
 * `cleanup` promise finishes the actual deletion in the background.
 * Must only be called while `next dev` is NOT running.
 * @param {{ force?: boolean, reason?: string }} [opts]
 */
export async function trimDevCache({ force = false, reason } = {}) {
  const done = { trimmed: false, cleanup: Promise.resolve() };
  if (!force && process.env.DEV_CACHE_TRIM === "0") return done;
  if (!fs.existsSync(NEXT_DIR)) return done;

  const release = acquireLock();
  if (!release) {
    log("another cache trim is in progress — skipping");
    return done;
  }
  try {
    const cleanup = purgeTrash();
    if (!fs.existsSync(DEV_CACHE)) return { trimmed: false, cleanup };

    const limit = maxBytes();
    const minFree = envNumber("DEV_CACHE_MIN_FREE_DISK_GB", 10) * GB;
    const size = await sizeUpTo(DEV_CACHE, force ? 0 : limit);
    const free = await freeDiskBytes(NEXT_DIR);

    let why = force ? reason || "forced" : null;
    if (!why && size > limit) why = `over the ${fmt(limit)} limit`;
    if (!why && minFree > 0 && free < minFree && size > GB) why = `disk has only ${fmt(free)} free`;
    if (!why) {
      log(`.next/dev is ${fmt(size)} (limit ${fmt(limit)}) — keeping it`);
      return { trimmed: false, cleanup };
    }

    const trash = path.join(NEXT_DIR, `${TRASH_PREFIX}${Date.now()}`);
    try {
      fs.renameSync(DEV_CACHE, trash);
    } catch (e) {
      log(`could not move .next/dev aside (${e.code || e.message}) — is next dev still running? leaving it`);
      return { trimmed: false, cleanup };
    }
    // The scan stops early, so `size` is a lower bound once over the limit.
    log(`cleared .next/dev (${why}; at least ${fmt(size)}) — Next will rebuild it`);
    return { trimmed: true, cleanup: Promise.all([cleanup, purgeTrash()]) };
  } finally {
    release();
  }
}

// CLI: `node scripts/trim-dev-cache.mjs [--force]`
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const port = Number(process.env.PORT) || 3000;
  if (await portInUse(port)) {
    log(`a server is running on :${port} — stop it before clearing the cache`);
    process.exit(1);
  }
  const { cleanup } = await trimDevCache({ force: process.argv.includes("--force"), reason: "--force" });
  await cleanup;
}
