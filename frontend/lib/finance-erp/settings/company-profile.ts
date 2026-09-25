import { createMockStore } from "@/lib/finance-erp/mock/create-store";
import { BRANCHES, type Branch } from "@/lib/finance-erp/mock/master-data";

export interface CompanyProfile {
  companyName: string;
  registrationNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  fiscalYear: string;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: "NexusCore Enterprises (Pvt) Ltd",
  registrationNumber: "REG-0042871",
  taxNumber: "NTN-1122334-5",
  address: "Shahrah-e-Faisal, Karachi, Pakistan",
  phone: "021-32345000",
  email: "info@nexuscore.io",
  currency: "PKR",
  fiscalYear: "July - June",
};

export const FISCAL_YEAR_OPTIONS = ["January - December", "July - June", "April - March"];

// Branches store seeded from the shared master list — this is FinanceSettings' own mutable copy;
// master-data.ts's BRANCHES constant itself is never mutated.
const branchStore = createMockStore<Branch>(BRANCHES.map((b) => ({ ...b })));

// Module-level mutable copy of the profile — same "persists for the page's session" pattern as
// every createMockStore-backed screen in Finance Settings, so Save actually sticks across a
// remount (switching away and back) instead of always reverting to DEFAULT_COMPANY_PROFILE.
let currentProfile: CompanyProfile = { ...DEFAULT_COMPANY_PROFILE };

export const companyProfileApi = {
  getProfile: async (): Promise<CompanyProfile> => ({ ...currentProfile }),
  updateProfile: async (patch: CompanyProfile): Promise<CompanyProfile> => {
    currentProfile = { ...patch };
    return { ...currentProfile };
  },
  getBranches: () => branchStore.list(),
  createBranch: (branch: Branch) => branchStore.create(branch),
  updateBranch: (id: string, patch: Partial<Branch>) => branchStore.update(id, patch),
  deleteBranch: (id: string) => branchStore.remove(id),
  snapshotBranches: () => branchStore.snapshot(),
};
