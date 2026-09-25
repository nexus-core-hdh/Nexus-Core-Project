// Generic in-memory mock "backend" for one entity type. Every Finance domain service
// (getDemands/createDemand/..., getPurchaseOrders/createPurchaseOrder/..., etc — spec section 10)
// should be a thin wrapper around one of these instead of hand-rolling array mutation, so the
// CRUD shape is identical everywhere and swapping in a real HTTP client later only means
// replacing this file's internals, not every call site.
//
// Frontend-only: state lives for the lifetime of the page (module-level array), matching the
// spec's "local state" requirement. Async-shaped (returns Promises) on purpose, so call sites
// already look exactly like they will once wired to real API calls.

export interface MockStore<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(record: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  /** Synchronous snapshot — for read-only cross-references between domains (e.g. Vendor Ledger
   *  reading the current Vendor Bills without an await chain in render). */
  snapshot(): T[];
}

const LATENCY_MS = 120;
const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export function createMockStore<T extends { id: string }>(seed: T[]): MockStore<T> {
  let rows: T[] = [...seed];

  return {
    async list() {
      await delay();
      return [...rows];
    },
    async get(id) {
      await delay();
      return rows.find((r) => r.id === id);
    },
    async create(record) {
      await delay();
      rows = [record, ...rows];
      return record;
    },
    async update(id, patch) {
      await delay();
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error("Record not found");
      rows[idx] = { ...rows[idx], ...patch };
      return rows[idx];
    },
    async remove(id) {
      await delay();
      rows = rows.filter((r) => r.id !== id);
    },
    snapshot() {
      return rows;
    },
  };
}

/** Formats a running counter into a document number like "PO-2026-0007" (spec: Numbering Series
 *  has Prefix/Starting Number/Current Number/Format/Branch). */
export function formatDocNumber(prefix: string, sequence: number, year = new Date().getFullYear(), digits = 4): string {
  return `${prefix}-${year}-${String(sequence).padStart(digits, "0")}`;
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
