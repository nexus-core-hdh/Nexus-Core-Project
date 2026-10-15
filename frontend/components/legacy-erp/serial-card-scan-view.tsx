"use client";

// Phone view of one Serial Card, opened by scanning its label (app/s/[serial]/page.tsx). Loads
// the card through the same permission-checked lookup the ERP scan box uses and shows it with
// the ERP detail dialog's own layout (SerialCardDetailView).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { SerialCardDetailView } from "./serial-card-detail-view";
import type { SerialCardRow } from "./serial-card-edit-dialog";
import { Layers, Printer, LogIn } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "ok"; card: SerialCardRow }
  | { kind: "signin" }
  | { kind: "error"; message: string };

export function SerialCardScanView({ serialNo }: { serialNo: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const loginHref = `/login/v1?next=${encodeURIComponent(`/s/${encodeURIComponent(serialNo)}`)}`;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    legacyErpApi.serialCards.byCode(serialNo)
      .then((card: any) => { if (!cancelled) setState({ kind: "ok", card: { ...card, id: card.RecId } }); })
      .catch((e: any) => {
        if (cancelled) return;
        if (e?.status === 401) {
          // The cookie said "signed in" but the session is gone — drop the stale cookie so the
          // login page doesn't bounce straight back here.
          document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
          setState({ kind: "signin" });
        } else if (e?.status === 403) {
          setState({ kind: "error", message: "You don't have permission to view Serial Cards." });
        } else if (e?.status === 404) {
          setState({ kind: "error", message: `No serial card with Serial No ${serialNo}.` });
        } else {
          setState({ kind: "error", message: e?.message || "Could not load the serial card." });
        }
      });
    return () => { cancelled = true; };
  }, [serialNo]);

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-2.5 print:static">
        <Layers className="h-4 w-4 text-primary" />
        <h1 className="text-[15px] font-semibold uppercase tracking-wide">
          Serial Card: <span className="font-mono">{state.kind === "ok" ? state.card.SerialCode : serialNo}</span>
        </h1>
        {state.kind === "ok" && (
          <Button size="sm" variant="outline" className="ml-auto h-8 print:hidden" onClick={() => window.print()} title="Print or save as PDF">
            <Printer className="h-3.5 w-3.5 mr-1.5" />Print / PDF
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-lg border border-border bg-background p-4 shadow-sm print:border-0 print:shadow-none">
          {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {state.kind === "ok" && <SerialCardDetailView card={state.card} detail={state.card} showRollFields showQr={false} />}
          {state.kind === "signin" && (
            <div className="space-y-3 text-sm">
              <p>Your session has ended. Sign in to view this serial card.</p>
              <Button asChild size="sm"><a href={loginHref}><LogIn className="h-3.5 w-3.5 mr-1.5" />Sign in</a></Button>
            </div>
          )}
          {state.kind === "error" && <p className="text-sm text-red-700 dark:text-red-400">{state.message}</p>}
        </div>
      </main>
    </div>
  );
}
