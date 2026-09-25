import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { EMPLOYEES } from "@/lib/finance-erp/mock/master-data";
import { NUMBERING_DOCUMENT_TYPES, type NumberingDocumentType } from "@/lib/finance-erp/settings/numbering-series";

export { NUMBERING_DOCUMENT_TYPES as APPROVAL_DOCUMENT_TYPES };

export interface ApprovalLevel {
  level: number;
  approver: string; // employee name
  minAmount: number;
  maxAmount: number;
}

export interface ApprovalWorkflow {
  id: string;
  documentType: NumberingDocumentType;
  levels: ApprovalLevel[];
  status: "Active" | "Inactive";
}

const SEED: ApprovalWorkflow[] = [
  {
    id: makeId("wf"),
    documentType: "Purchase Order",
    levels: [
      { level: 1, approver: "Bilal Khan (Procurement Officer)", minAmount: 0, maxAmount: 500_000 },
      { level: 2, approver: "Ahmed Raza (Finance Manager)", minAmount: 500_001, maxAmount: 2_000_000 },
      { level: 3, approver: "Sana Malik (Chief Financial Officer)", minAmount: 2_000_001, maxAmount: 999_999_999 },
    ],
    status: "Active",
  },
  {
    id: makeId("wf"),
    documentType: "Journal Entry",
    levels: [
      { level: 1, approver: "Hina Sheikh (Accountant)", minAmount: 0, maxAmount: 1_000_000 },
      { level: 2, approver: "Ahmed Raza (Finance Manager)", minAmount: 1_000_001, maxAmount: 999_999_999 },
    ],
    status: "Active",
  },
  {
    id: makeId("wf"),
    documentType: "Sales Invoice",
    levels: [{ level: 1, approver: "Ahmed Raza (Finance Manager)", minAmount: 0, maxAmount: 999_999_999 }],
    status: "Active",
  },
  {
    id: makeId("wf"),
    documentType: "Vendor Payment",
    levels: [
      { level: 1, approver: "Hina Sheikh (Accountant)", minAmount: 0, maxAmount: 300_000 },
      { level: 2, approver: "Ahmed Raza (Finance Manager)", minAmount: 300_001, maxAmount: 999_999_999 },
    ],
    status: "Active",
  },
  {
    id: makeId("wf"),
    documentType: "Asset",
    levels: [{ level: 1, approver: "Sana Malik (Chief Financial Officer)", minAmount: 0, maxAmount: 999_999_999 }],
    status: "Inactive",
  },
];

const store = createMockStore<ApprovalWorkflow>(SEED);

export const APPROVER_OPTIONS = EMPLOYEES.map((e) => `${e.name} (${e.designation})`);

export const approvalWorkflowsApi = {
  list: () => store.list(),
  async create(row: ApprovalWorkflow) {
    assertRequired(row.documentType, "Document Type", "documentType");
    if (row.levels.length === 0) throw new Error("At least one approval level is required.");
    return store.create(row);
  },
  update: (id: string, patch: Partial<ApprovalWorkflow>) => store.update(id, patch),
  remove: (id: string) => store.remove(id),
  snapshot: () => store.snapshot(),
};
