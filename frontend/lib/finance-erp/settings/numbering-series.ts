import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";
import { BRANCHES } from "@/lib/finance-erp/mock/master-data";

export const NUMBERING_DOCUMENT_TYPES = [
  "Demand", "Receipt", "Issuance", "Purchase Order", "Purchase Invoice", "Vendor Bill",
  "Debit Note", "Vendor Payment", "Sales Order", "Sales Invoice", "Credit Note",
  "Customer Receipt", "Journal Entry", "Asset",
] as const;
export type NumberingDocumentType = typeof NUMBERING_DOCUMENT_TYPES[number];

export const ALL_BRANCHES_OPTION = "All Branches";

export interface NumberingSeries {
  id: string;
  documentType: NumberingDocumentType;
  prefix: string;
  startingNumber: number;
  currentNumber: number;
  format: string;
  branch: string; // branch id, or ALL_BRANCHES_OPTION
  status: "Active" | "Inactive";
}

const PREFIX_BY_TYPE: Record<NumberingDocumentType, string> = {
  Demand: "DEM", Receipt: "GRN", Issuance: "ISS", "Purchase Order": "PO", "Purchase Invoice": "PI",
  "Vendor Bill": "VB", "Debit Note": "DN", "Vendor Payment": "VP", "Sales Order": "SO",
  "Sales Invoice": "SI", "Credit Note": "CN", "Customer Receipt": "CR", "Journal Entry": "JE", Asset: "FA",
};

const SEED: NumberingSeries[] = NUMBERING_DOCUMENT_TYPES.map((docType, i) => ({
  id: makeId("num"),
  documentType: docType,
  prefix: PREFIX_BY_TYPE[docType],
  startingNumber: 1,
  currentNumber: 40 + i * 7,
  format: "{PREFIX}-{YYYY}-{SEQ}",
  branch: ALL_BRANCHES_OPTION,
  status: "Active",
}));

const store = createMockStore<NumberingSeries>(SEED);

function dedupeKey(row: Pick<NumberingSeries, "documentType" | "branch">): string {
  return `${row.documentType}::${row.branch}`;
}

export const numberingSeriesApi = {
  list: () => store.list(),
  branchOptions: () => [ALL_BRANCHES_OPTION, ...BRANCHES.map((b) => b.name)],
  async create(row: NumberingSeries) {
    assertRequired(row.prefix, "Prefix", "prefix");
    const existing = store.snapshot();
    assertNotDuplicate(
      existing.map((r) => ({ id: r.id, key: dedupeKey(r) })),
      "key",
      dedupeKey(row),
      "Numbering series",
    );
    return store.create(row);
  },
  async update(id: string, patch: Partial<NumberingSeries>) {
    const existing = store.snapshot();
    const current = existing.find((r) => r.id === id)!;
    const merged = { ...current, ...patch };
    assertNotDuplicate(
      existing.map((r) => ({ id: r.id, key: dedupeKey(r) })),
      "key",
      dedupeKey(merged),
      "Numbering series",
      "id",
      id,
    );
    return store.update(id, patch);
  },
  remove: (id: string) => store.remove(id),
  snapshot: () => store.snapshot(),
};
