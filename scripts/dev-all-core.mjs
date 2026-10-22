// Backend availability monitor for dev-all.mjs (pure: probe, clock and log are injected, so it is
// testable with fakes — dev-all.test.mjs).
//
// Nest watch mode kills and re-boots the API after every successful compile, so a few seconds of
// "connection refused" after a save are normal. What used to be invisible is the API staying down
// (a crash on boot, or a restart that never came back) while the frontend kept showing generic
// errors. This only REPORTS state changes; it never restarts anything (an automatic restart loop
// would hide a persistent compile error or crash).
export function createBackendMonitor({ probe, log, now = Date.now, port = 4000, slowAfterMs = 60_000 }) {
  let state = "unknown"; // "up" | "down" | "unknown"
  let downSince = 0;
  let warnedSlow = false;
  const clock = (t) => new Date(t).toLocaleTimeString();

  return {
    get state() {
      return state;
    },
    async check() {
      const up = await probe().catch(() => false);
      const t = now();
      if (up) {
        if (state === "down") log(`[dev-all] backend :${port} is back (down ${((t - downSince) / 1000).toFixed(1)}s)`);
        state = "up";
        return state;
      }
      if (state !== "down") {
        state = "down";
        downSince = t;
        warnedSlow = false;
        log(`[dev-all] backend :${port} stopped answering at ${clock(t)} — normally a watch-mode restart after a save; API calls get 503 "temporarily unavailable" until it is back`);
      } else if (!warnedSlow && t - downSince >= slowAfterMs) {
        warnedSlow = true;
        log(`[dev-all] backend :${port} still down after ${Math.round((t - downSince) / 1000)}s — look above for a compile error or crash. Watch mode only restarts it after the next successful compile (save a file), or restart npm run dev.`);
      }
      return state;
    },
  };
}

/** Liveness probe: any HTTP answer from the API counts as up (the server only listens once booted). */
export function httpProbe(url, timeoutMs = 2000) {
  return async () => {
    try {
      await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return true;
    } catch {
      return false;
    }
  };
}
