"use client";

import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { MasterLookupScreen } from "@/components/legacy-erp/master-lookup-screen";

// Deliberately a STATIC route (no [key] dynamic segment) even though it serves every master
// (Fab Type today, any future one) — the Workspace registry generator explicitly skips any
// route containing a dynamic segment (scripts/generate-workspace-registry.mjs: "Dynamic
// segments aren't addressable by a single static import path"), so a `[key]` version of this
// page would silently fall back to a plain page navigation instead of opening as a real
// Workspace tab — exactly what this screen must never do. Reading `key`/`mode`/`requestId`/
// `returnTab` from the query string instead gets the same "one screen, many masters via
// configuration" result while staying a real, tab-registered route.
export default function MasterLookupPage() {
  const params = useWorkspaceSearchParams();
  const masterKey = params.get("key") || "";
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;

  if (!masterKey) {
    return <div className="p-8 text-sm text-muted-foreground">No master specified — open this screen with a ?key=... parameter.</div>;
  }

  return <MasterLookupScreen masterKey={masterKey} mode={mode} requestId={requestId} returnTab={returnTab} />;
}
