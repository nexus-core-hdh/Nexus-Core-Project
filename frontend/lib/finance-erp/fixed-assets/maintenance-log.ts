import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";

export type MaintenanceType = "Preventive" | "Corrective" | "Inspection";
export const MAINTENANCE_TYPES: MaintenanceType[] = ["Preventive", "Corrective", "Inspection"];
export type MaintenanceStatus = "Scheduled" | "In Progress" | "Completed";

export interface MaintenanceLogEntry {
  id: string;
  assetId: string;
  maintenanceDate: string;
  type: MaintenanceType;
  vendorId: string;
  cost: number;
  description: string;
  nextMaintenanceDate: string;
  status: MaintenanceStatus;
}

const seed: MaintenanceLogEntry[] = [
  { id: "ml-1", assetId: "fa-1", maintenanceDate: "2026-04-10", type: "Preventive", vendorId: "v-4", cost: 85_000, description: "Quarterly lubrication and calibration service", nextMaintenanceDate: "2026-07-10", status: "Completed" },
  // Dated before fa-3's disposal (2026-03-01, see transfer-disposal.ts ds-1) — a completed
  // record, not scheduled/in-progress work on an asset that no longer exists.
  { id: "ml-2", assetId: "fa-3", maintenanceDate: "2025-11-10", type: "Corrective", vendorId: "v-1", cost: 42_500, description: "Replaced failed RAID controller", nextMaintenanceDate: "2026-02-10", status: "Completed" },
  { id: "ml-3", assetId: "fa-2", maintenanceDate: "2026-05-05", type: "Preventive", vendorId: "v-2", cost: 28_000, description: "10,000 km service — oil, filters, brake check", nextMaintenanceDate: "2026-11-05", status: "Completed" },
  { id: "ml-4", assetId: "fa-1", maintenanceDate: "2026-09-15", type: "Inspection", vendorId: "v-4", cost: 15_000, description: "Annual safety compliance inspection", nextMaintenanceDate: "2027-09-15", status: "Scheduled" },
];

const store = createMockStore<MaintenanceLogEntry>(seed);

export const maintenanceLogApi = {
  list: () => store.list(),
  snapshot: () => store.snapshot(),
  async create(input: Omit<MaintenanceLogEntry, "id">) {
    assertRequired(input.assetId, "Asset");
    assertRequired(input.maintenanceDate, "Maintenance Date");
    return store.create({ ...input, id: makeId("ml") });
  },
  async update(id: string, input: Partial<Omit<MaintenanceLogEntry, "id">>) {
    return store.update(id, input);
  },
  remove: (id: string) => store.remove(id),
};

export { VENDORS };
