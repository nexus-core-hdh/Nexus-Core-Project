import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired, assertBalanced, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { todayIso, addDaysIso } from "@/lib/finance-erp/utils/format";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface JournalLine {
  id: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  journalNumber: string;
  date: string;
  reference: string;
  description: string;
  branchId: string;
  costCenterId: string;
  lines: JournalLine[];
  status: FinanceStatus;
  reversalOfId?: string;
}

function line(accountId: string, description: string, debit: number, credit: number): JournalLine {
  return { id: makeId("jl"), accountId, description, debit, credit };
}

const SEED: JournalEntry[] = [
  {
    id: "je-1", journalNumber: formatDocNumber("JE", 91), date: addDaysIso(todayIso(), -2), reference: "DEP-AUG-2026",
    description: "Depreciation for August 2026", branchId: "br-1", costCenterId: "cc-2",
    lines: [line("a-5400", "Depreciation expense - PPE", 480000, 0), line("a-1220", "Accumulated depreciation", 0, 480000)],
    status: "Posted",
  },
  {
    id: "je-2", journalNumber: formatDocNumber("JE", 90), date: addDaysIso(todayIso(), -3), reference: "BC-MCB-0906",
    description: "Bank charges - MCB Main Account", branchId: "br-1", costCenterId: "cc-1",
    lines: [line("a-5500", "Bank service charges", 3500, 0), line("a-1110", "MCB Main Account", 0, 3500)],
    status: "Posted",
  },
  {
    id: "je-3", journalNumber: formatDocNumber("JE", 89), date: addDaysIso(todayIso(), -4), reference: "PAY-SEP-ACR",
    description: "Salary accrual - September", branchId: "br-1", costCenterId: "cc-1",
    lines: [line("a-5200", "Salaries & wages", 2150000, 0), line("a-2100", "Accrued salaries payable", 0, 2150000)],
    status: "Pending Approval",
  },
  {
    id: "je-4", journalNumber: formatDocNumber("JE", 88), date: addDaysIso(todayIso(), -8), reference: "FX-REV-0828",
    description: "Foreign exchange revaluation - USD advances", branchId: "br-2", costCenterId: "cc-3",
    lines: [line("a-5500", "Exchange loss", 62000, 0), line("a-1130", "Advance to suppliers (FX)", 0, 62000)],
    status: "Approved",
  },
  {
    id: "je-5", journalNumber: formatDocNumber("JE", 87), date: addDaysIso(todayIso(), -10), reference: "OPEX-AUG",
    description: "Utilities expense - Production floor, August", branchId: "br-1", costCenterId: "cc-2",
    lines: [line("a-5200", "Utilities", 385000, 0), line("a-1110", "MCB Main Account", 0, 385000)],
    status: "Posted",
  },
  {
    id: "je-6", journalNumber: formatDocNumber("JE", 86), date: addDaysIso(todayIso(), -15), reference: "DRAFT-ADJ",
    description: "Provision for doubtful debts - draft, not yet balanced", branchId: "br-1", costCenterId: "cc-1",
    lines: [line("a-5200", "Bad debt provision", 150000, 0), line("a-1120", "Accounts receivable", 0, 140000)],
    status: "Draft",
  },
];

const store = createMockStore<JournalEntry>(SEED);
let seq = SEED.length + 1;

export async function getJournalEntries(): Promise<JournalEntry[]> {
  const rows = await store.list();
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostedJournalEntriesSnapshot(): JournalEntry[] {
  return store.snapshot().filter((j) => j.status === "Posted");
}

export async function getJournalEntry(id: string): Promise<JournalEntry | undefined> {
  return store.get(id);
}

export interface JournalEntryInput {
  date: string;
  reference: string;
  description: string;
  branchId: string;
  costCenterId: string;
  lines: JournalLine[];
}

function totals(lines: JournalLine[]) {
  return {
    debit: lines.reduce((s, l) => s + (Number(l.debit) || 0), 0),
    credit: lines.reduce((s, l) => s + (Number(l.credit) || 0), 0),
  };
}
export { totals as journalTotals };

/** Lines that actually carry an amount — a leftover blank template row (no account, zero/zero)
 *  contributes nothing to the entry and shouldn't be forced to have an account selected. */
function activeLines(lines: JournalLine[]): JournalLine[] {
  return lines.filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0);
}

export async function createJournalEntry(input: JournalEntryInput, status: FinanceStatus = "Draft"): Promise<JournalEntry> {
  assertRequired(input.description, "Description");
  assertRequired(input.date, "Date");
  const entry: JournalEntry = {
    id: makeId("je"), journalNumber: formatDocNumber("JE", seq++), status, ...input,
  };
  return store.create(entry);
}

export async function updateJournalEntry(id: string, input: JournalEntryInput): Promise<JournalEntry> {
  assertRequired(input.description, "Description");
  return store.update(id, input);
}

export async function submitJournalEntry(id: string): Promise<JournalEntry> {
  return store.update(id, { status: "Pending Approval" });
}

export async function approveJournalEntry(id: string): Promise<JournalEntry> {
  return store.update(id, { status: "Approved" });
}

export async function postJournalEntry(id: string): Promise<JournalEntry> {
  const je = await store.get(id);
  if (!je) throw new Error("Journal entry not found");
  const active = activeLines(je.lines);
  if (active.length === 0) {
    throw new FinanceValidationError("Journal entry must have at least one debit and one credit line before it can be posted.");
  }
  for (const l of active) {
    if (l.debit > 0 && l.credit > 0) {
      throw new FinanceValidationError(`Line "${l.description || l.accountId}" cannot have an amount in both Debit and Credit.`);
    }
    assertRequired(l.accountId, "Account on every journal line with an amount");
  }
  const t = totals(je.lines);
  assertBalanced(t.debit, t.credit);
  return store.update(id, { status: "Posted" });
}

export async function reverseJournalEntry(id: string): Promise<JournalEntry> {
  const je = await store.get(id);
  if (!je) throw new Error("Journal entry not found");
  if (je.status !== "Posted") throw new Error("Only posted entries can be reversed");
  const reversed: JournalEntry = {
    ...je,
    id: makeId("je"),
    journalNumber: formatDocNumber("JE", seq++),
    date: todayIso(),
    description: `Reversal of ${je.journalNumber} - ${je.description}`,
    lines: je.lines.map((l) => ({ ...l, id: makeId("jl"), debit: l.credit, credit: l.debit })),
    status: "Posted",
    reversalOfId: je.id,
  };
  await store.create(reversed);
  await store.update(id, { status: "Cancelled" });
  return reversed;
}

export async function cancelJournalEntry(id: string): Promise<void> {
  await store.update(id, { status: "Cancelled" });
}
