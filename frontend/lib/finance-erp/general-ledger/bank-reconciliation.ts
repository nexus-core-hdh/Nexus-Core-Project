import { BANK_ACCOUNTS } from "@/lib/finance-erp/mock/master-data";
import { addDaysIso, todayIso } from "@/lib/finance-erp/utils/format";

export interface ReconTransaction {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number; // positive = deposit/inflow, negative = withdrawal/outflow
}

export interface BankReconData {
  bankBalance: number;
  bookBalance: number;
  statementTransactions: ReconTransaction[];
  bookTransactions: ReconTransaction[];
}

const today = todayIso();

/** Mock bank feed vs. book-side transactions for one bank account. Some rows share the same
 *  reference+amount (obvious matches); a few exist only on one side (timing differences /
 *  unrecorded bank charges) to exercise the "unmatched" state. */
export function getBankReconciliationData(bankAccountId: string): BankReconData {
  const acc = BANK_ACCOUNTS.find((b) => b.id === bankAccountId);
  const base = acc?.openingBalance ?? 0;

  const statementTransactions: ReconTransaction[] = [
    { id: "st-1", date: addDaysIso(today, -9), description: "Customer transfer - Metro Retail Group", reference: "TRF-88213", amount: 845000 },
    { id: "st-2", date: addDaysIso(today, -8), description: "Cheque cleared - Al-Habib Textile Mills", reference: "CHQ-004521", amount: -512000 },
    { id: "st-3", date: addDaysIso(today, -7), description: "Bank charges", reference: "BC-090626", amount: -3500 },
    { id: "st-4", date: addDaysIso(today, -6), description: "Customer transfer - Lahore Garments Export", reference: "TRF-88240", amount: 1260000 },
    { id: "st-5", date: addDaysIso(today, -4), description: "Profit on deposit", reference: "POD-090626", amount: 18500 },
    { id: "st-6", date: addDaysIso(today, -2), description: "Cheque cleared - Crescent Fabrics Ltd", reference: "CHQ-004530", amount: -233400 },
  ];

  const bookTransactions: ReconTransaction[] = [
    { id: "bt-1", date: addDaysIso(today, -9), description: "Customer transfer - Metro Retail Group", reference: "TRF-88213", amount: 845000 },
    { id: "bt-2", date: addDaysIso(today, -8), description: "Cheque issued - Al-Habib Textile Mills", reference: "CHQ-004521", amount: -512000 },
    { id: "bt-3", date: addDaysIso(today, -6), description: "Customer transfer - Lahore Garments Export", reference: "TRF-88240", amount: 1260000 },
    { id: "bt-4", date: addDaysIso(today, -1), description: "Cheque issued - Punjab Packaging Co (not yet cleared)", reference: "CHQ-004535", amount: -145000 },
    { id: "bt-5", date: addDaysIso(today, -2), description: "Cheque issued - Crescent Fabrics Ltd", reference: "CHQ-004530", amount: -233400 },
  ];

  const bankBalance = base + statementTransactions.reduce((s, t) => s + t.amount, 0);
  const bookBalance = base + bookTransactions.reduce((s, t) => s + t.amount, 0);

  return { bankBalance, bookBalance, statementTransactions, bookTransactions };
}
