import { createMockStore } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";
import { TAX_RATES, type TaxRate } from "@/lib/finance-erp/mock/master-data";

export const TAX_ACCOUNT_OPTIONS = ["2210 - Sales Tax Payable", "2220 - WHT Payable"];

// Finance Settings' own mutable copy of the shared TAX_RATES seed — master-data.ts's constant is
// never mutated directly.
const store = createMockStore<TaxRate>(TAX_RATES.map((t) => ({ ...t })));

function dedupeKey(t: Pick<TaxRate, "type" | "rate">): string {
  return `${t.type}::${t.rate}`;
}

export const taxConfigurationApi = {
  list: () => store.list(),
  async create(rate: TaxRate) {
    assertRequired(rate.name, "Tax Name", "name");
    const existing = store.snapshot();
    assertNotDuplicate(
      existing.map((t) => ({ id: t.id, key: dedupeKey(t) })),
      "key",
      dedupeKey(rate),
      "Tax configuration",
    );
    return store.create(rate);
  },
  async update(id: string, patch: Partial<TaxRate>) {
    const existing = store.snapshot();
    const current = existing.find((t) => t.id === id);
    const merged = { ...current, ...patch } as TaxRate;
    assertNotDuplicate(
      existing.map((t) => ({ id: t.id, key: dedupeKey(t) })),
      "key",
      dedupeKey(merged),
      "Tax configuration",
      "id",
      id,
    );
    return store.update(id, patch);
  },
  remove: (id: string) => store.remove(id),
  snapshot: () => store.snapshot(),
};
