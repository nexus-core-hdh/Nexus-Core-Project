import { create } from "zustand";

export interface WorkspaceLookupSelection {
  id: number | string;
  code: string;
  name: string;
  // Optional extra data a specific caller/screen pair needs beyond id/code/name — e.g. the
  // Purchase Order line grid's Inventory lookup needs to know which card type (fabric/yarn/
  // trim) was picked, to know which per-type endpoint to call for VAT/Unit defaults. Additive
  // and backward-compatible: existing callers that only read id/code/name are unaffected.
  meta?: Record<string, any>;
}

interface WorkspaceLookupState {
  // Keyed by a caller-generated requestId, not by masterKey — a screen can have several
  // Master Lookup fields open in flight (rare but possible) without them colliding.
  results: Record<string, WorkspaceLookupSelection | undefined>;
  resolve: (requestId: string, selection: WorkspaceLookupSelection) => void;
  consume: (requestId: string) => WorkspaceLookupSelection | undefined;
}

// Purely in-memory pub/sub "mailbox" that lets a Master Lookup tab hand a selected record
// back to whichever field opened it, without a page reload or prop drilling — both are live
// React trees at the same time (the Workspace Tab Bar keeps every open tab mounted, just
// hidden via CSS; see workspace-content-stack.tsx), so a caller field's `useEffect` can
// simply subscribe to this store for its own requestId and pick the value up the instant
// the lookup screen writes it. Never persisted — purely a same-session handoff.
export const useWorkspaceLookupStore = create<WorkspaceLookupState>((set, get) => ({
  results: {},
  resolve: (requestId, selection) =>
    set((state) => ({ results: { ...state.results, [requestId]: selection } })),
  consume: (requestId) => {
    const value = get().results[requestId];
    if (value !== undefined) {
      set((state) => {
        const next = { ...state.results };
        delete next[requestId];
        return { results: next };
      });
    }
    return value;
  },
}));
