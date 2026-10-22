"use client";

import * as React from "react";

export type AsyncOptionsStatus = "idle" | "loading" | "ready" | "empty" | "error";

/**
 * Loads the options of an async dropdown and always ends in a terminal state: "ready" (has items),
 * "empty" (loaded, nothing to show) or "error" (with `retry`). Pass `null` as the loader while the
 * dropdown has nothing to load yet (e.g. no company chosen) — the state is then "idle".
 *
 * `deps` decide when to reload. A response that arrives after the deps changed (the user picked
 * another company mid-request) is discarded, so stale options never replace current ones.
 */
export function useAsyncOptions<T>(loader: (() => Promise<T[] | null | undefined>) | null, deps: React.DependencyList) {
  const [items, setItems] = React.useState<T[]>([]);
  const [status, setStatus] = React.useState<AsyncOptionsStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const request = ++requestRef.current;
    setItems([]);
    setError(null);
    if (!loader) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    loader()
      .then((result) => {
        if (request !== requestRef.current) return;
        const list = Array.isArray(result) ? result : [];
        setItems(list);
        setStatus(list.length ? "ready" : "empty");
      })
      .catch((e: unknown) => {
        if (request !== requestRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  // Invalidate any in-flight request on unmount.
  React.useEffect(() => () => { requestRef.current++; }, []);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { items, status, error, retry, isLoading: status === "loading" };
}
