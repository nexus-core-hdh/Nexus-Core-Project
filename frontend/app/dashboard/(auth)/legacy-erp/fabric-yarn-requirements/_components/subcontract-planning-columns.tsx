"use client";

// Dynamic Subcontractor Transaction columns — shared by Fabric/Yarn/Trim Planning (each calls
// this instead of hand-rolling its own static "Process Sent"/"Process Received" columns). Column
// SET is driven entirely by real, active MD_SubcontractType rows (the SAME useSubcontractTypes()
// hook/cache receipt-menu.ts's own "Subcontractor Transactions" menu already uses — no second
// lookup, same InUse=1 filter, same name ordering) — a new active type added through the existing
// master-data screen appears here automatically on next load, no code change. Column VALUES come
// from each row's own `subcontractTransactions` field (fabric-planning.service.ts's
// aggregateSubcontractReceipts — one batched query, not one per type/row), keyed by the real
// MD_SubcontractType.RecId, never a name/label match.
//
// Only Send/Receive are surfaced here (134/11) — see aggregateSubcontractReceipts' own comment on
// why Return (12) has no column slot in this reference layout, same documented scope as
// receipt-menu.ts's own menu-side gap.
import type { ReportColumn } from "./report-grid";
import type { SubcontractTypeOption } from "./receipt-menu";

export interface SubcontractTxnValue { send: number; receive: number }
/** Row shape every caller's own PlanningRow already satisfies — keys are the real
 *  MD_SubcontractType.RecId as a string (JSON object keys are always strings; see
 *  aggregateSubcontractReceipts' own comment on why this crosses the wire as a plain object). */
export type SubcontractTxnMap = Record<string, SubcontractTxnValue>;

export function buildSubcontractPlanningColumns<T extends { subcontractTransactions?: SubcontractTxnMap | null }>(
  types: SubcontractTypeOption[],
  round: (value: unknown, fieldKey: "quantity") => number,
): ReportColumn<T>[] {
  return types.flatMap((t): ReportColumn<T>[] => [
    {
      key: `subcontract-${t.id}-send`, label: `${t.name} Send`, defaultWidth: 120, align: "right",
      render: (r) => round(r.subcontractTransactions?.[String(t.id)]?.send ?? 0, "quantity").toLocaleString(),
    },
    {
      key: `subcontract-${t.id}-receive`, label: `${t.name} Receive`, defaultWidth: 130, align: "right",
      render: (r) => round(r.subcontractTransactions?.[String(t.id)]?.receive ?? 0, "quantity").toLocaleString(),
    },
  ]);
}
