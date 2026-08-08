"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore, type WorkspaceLookupSelection } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

const MASTER_LOOKUP_PATH = "/dashboard/legacy-erp/master-lookup";

/**
 * The reusable "Lookup Selection" behavior every Master Lookup-backed field uses to open
 * the full Workspace screen and receive the record the user picked there — not specific to
 * Fab Type. Any future field (Brand, Color, GSM, Composition, Finish, Weave, Supplier
 * Type, Customer Type, ...) wires up the same way: `useMasterLookupField({ masterKey,
 * onResolved })`, call the returned `openFullScreen()` from F2/the search icon.
 *
 * `requestId` is tracked in real React state (not a ref) deliberately — a ref mutation
 * doesn't force a re-render, so a `useWorkspaceLookupStore` selector closing over a ref can
 * end up subscribed with a stale (pre-mutation) closure until something *else* happens to
 * re-render the component. State guarantees the subscription is always current the instant
 * a lookup is opened, which is what makes "double-click returns immediately" reliable.
 */
export function useMasterLookupField(
  masterKey: string,
  onResolved: (selection: WorkspaceLookupSelection) => void,
  // Optional override for which Workspace screen F2/the search icon opens — defaults to the
  // generic Master Lookup screen. A field whose data source is a dedicated existing module
  // screen instead (e.g. Fabric Card's Yarn Count fields reuse the existing Yarn Card List
  // screen) passes that screen's own static route here; everything else about "open + wait
  // for a selection to come back" stays identical.
  path: string = MASTER_LOOKUP_PATH,
) {
  const router = useRouter();
  const tabCtx = useWorkspaceTabContext();
  const openTab = useWorkspaceStore((s) => s.openTab);
  const consume = useWorkspaceLookupStore((s) => s.consume);
  const [requestId, setRequestId] = useState<string | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const resolved = useWorkspaceLookupStore((s) => (requestId ? s.results[requestId] : undefined));

  useEffect(() => {
    if (!resolved || !requestId) return;
    onResolvedRef.current(resolved);
    consume(requestId);
    setRequestId(null);
  }, [resolved, requestId, consume]);

  // extraParams lets a caller narrow which records the target screen shows (e.g. Purchase
  // Order's Fixed Asset Code column reuses this same Inventory lookup screen filtered to
  // sourceType=fixedasset instead of building a second picker) — additive and optional so
  // every existing caller keeps working unchanged.
  const openFullScreen = (extraParams?: Record<string, string>) => {
    const id = `${masterKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRequestId(id);
    const currentTab = tabCtx ? useWorkspaceStore.getState().tabs.find((t) => t.key === tabCtx.tabKey) : undefined;
    const returnHref = currentTab?.href ?? `${window.location.pathname}${window.location.search}`;
    const extra = extraParams
      ? Object.entries(extraParams).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('')
      : '';
    const href = `${path}?key=${encodeURIComponent(masterKey)}&mode=lookup`
      + `&requestId=${encodeURIComponent(id)}&returnTab=${encodeURIComponent(returnHref)}${extra}`;
    openTab({ key: path, href });
    router.replace(href, { scroll: false });
  };

  return { openFullScreen };
}
