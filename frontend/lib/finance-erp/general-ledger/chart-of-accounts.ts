import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { CHART_OF_ACCOUNTS, type AccountNode } from "@/lib/finance-erp/mock/master-data";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";

export type { AccountNode };

export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;

const store = createMockStore<AccountNode>(CHART_OF_ACCOUNTS.map((a) => ({ ...a })));

export async function getAccounts(): Promise<AccountNode[]> {
  const rows = await store.list();
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

export function getAccountsSnapshot(): AccountNode[] {
  return store.snapshot();
}

export interface AccountInput {
  code: string;
  name: string;
  type: AccountNode["type"];
  parentId: string | null;
  nature: AccountNode["nature"];
  status: AccountNode["status"];
}

function validate(input: AccountInput, excludeId?: string) {
  assertRequired(input.code, "Account Code", "code");
  assertRequired(input.name, "Account Name", "name");
  const rows = store.snapshot();
  assertNotDuplicate(rows, "code", input.code, "Account code", "id", excludeId);
  assertNotDuplicate(rows, "name", input.name, "Account", "id", excludeId);
}

export async function createAccount(input: AccountInput): Promise<AccountNode> {
  validate(input);
  return store.create({ id: makeId("acc"), ...input });
}

export async function updateAccount(id: string, input: AccountInput): Promise<AccountNode> {
  validate(input, id);
  return store.update(id, input);
}

export async function toggleAccountStatus(id: string): Promise<AccountNode> {
  const acc = await store.get(id);
  if (!acc) throw new Error("Account not found");
  return store.update(id, { status: acc.status === "Active" ? "Inactive" : "Active" });
}
