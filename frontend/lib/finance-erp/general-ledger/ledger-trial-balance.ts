import { getAccountsSnapshot, type AccountNode } from "@/lib/finance-erp/general-ledger/chart-of-accounts";
import { getPostedJournalEntriesSnapshot } from "@/lib/finance-erp/general-ledger/journal-entries";

export interface LedgerEntryRow {
  date: string;
  journalNumber: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountNode["type"];
  debit: number;
  credit: number;
}

/** All posted JE lines for one account, oldest-first, with a running balance (nature-aware: a
 *  Debit-nature account's balance increases with debits, a Credit-nature account's with credits). */
export function getGeneralLedgerForAccount(
  accountId: string, dateFrom?: string, dateTo?: string, branchId?: string, costCenterId?: string,
): LedgerEntryRow[] {
  const account = getAccountsSnapshot().find((a) => a.id === accountId);
  const entries = getPostedJournalEntriesSnapshot()
    .filter((je) => (!dateFrom || je.date >= dateFrom) && (!dateTo || je.date <= dateTo))
    .filter((je) => (!branchId || je.branchId === branchId) && (!costCenterId || je.costCenterId === costCenterId))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let balance = 0;
  const rows: LedgerEntryRow[] = [];
  for (const je of entries) {
    for (const line of je.lines) {
      if (line.accountId !== accountId) continue;
      const delta = account?.nature === "Credit" ? line.credit - line.debit : line.debit - line.credit;
      balance += delta;
      rows.push({ date: je.date, journalNumber: je.journalNumber, reference: je.reference, description: line.description || je.description, debit: line.debit, credit: line.credit, runningBalance: balance });
    }
  }
  return rows;
}

export function getTrialBalance(dateFrom?: string, dateTo?: string, branchId?: string, costCenterId?: string): TrialBalanceRow[] {
  const accounts = getAccountsSnapshot();
  const entries = getPostedJournalEntriesSnapshot()
    .filter((je) => (!dateFrom || je.date >= dateFrom) && (!dateTo || je.date <= dateTo))
    .filter((je) => (!branchId || je.branchId === branchId) && (!costCenterId || je.costCenterId === costCenterId));

  const totalsByAccount = new Map<string, { debit: number; credit: number }>();
  for (const je of entries) {
    for (const line of je.lines) {
      const t = totalsByAccount.get(line.accountId) ?? { debit: 0, credit: 0 };
      t.debit += line.debit;
      t.credit += line.credit;
      totalsByAccount.set(line.accountId, t);
    }
  }

  const rows: TrialBalanceRow[] = [];
  for (const [accountId, t] of totalsByAccount) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const net = t.debit - t.credit;
    rows.push({
      accountId, code: account.code, name: account.name, type: account.type,
      debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0,
    });
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}
