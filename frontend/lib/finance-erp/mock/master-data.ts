// Shared, cross-module mock reference data for the Finance module (spec section 10). Every
// domain (Payable, Receivable, Inventory, Fixed Assets, General Ledger, Settings) imports these
// SAME lists instead of inventing its own vendors/customers/accounts, so a vendor named on a
// Purchase Order is the exact same vendor shown on the Vendor Ledger / Vendor Payments / Aging
// screens. Pure in-memory, frontend-only — replace with real API calls in a later phase.

export interface Branch { id: string; code: string; name: string; address: string; manager: string; status: "Active" | "Inactive"; }
export interface Department { id: string; code: string; name: string; }
export interface Warehouse { id: string; code: string; name: string; branchId: string; }
export interface Currency { code: string; name: string; symbol: string; }
export interface Employee { id: string; name: string; designation: string; departmentId: string; }

export interface Vendor {
  id: string; code: string; name: string; taxRegNo: string; ntn: string;
  paymentTerms: string; address: string; phone: string; email: string; status: "Active" | "Inactive";
}

export interface Customer {
  id: string; code: string; name: string; taxRegNo: string; ntn: string;
  billingAddress: string; shippingAddress: string; phone: string; email: string;
  creditLimit: number; paymentTerms: string; status: "Active" | "Inactive";
}

export interface BankAccount {
  id: string; name: string; type: "Bank" | "Cash"; bankName?: string; accountNo?: string; branchId: string; openingBalance: number;
}

export interface InventoryItem {
  id: string; code: string; name: string; unit: string; category: string; standardRate: number;
}

export interface TaxRate {
  id: string; name: string; type: "Sales Tax" | "WHT"; rate: number; account: string; status: "Active" | "Inactive";
}

export interface CostCenter {
  id: string; code: string; name: string; branchId: string; manager: string; budget: number; status: "Active" | "Inactive";
}

export interface AccountNode {
  id: string; code: string; name: string; type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  parentId: string | null; nature: "Debit" | "Credit"; status: "Active" | "Inactive";
}

export const BRANCHES: Branch[] = [
  { id: "br-1", code: "HO", name: "Head Office - Karachi", address: "Shahrah-e-Faisal, Karachi", manager: "Ahmed Raza", status: "Active" },
  { id: "br-2", code: "LHR", name: "Lahore Branch", address: "Gulberg III, Lahore", manager: "Bilal Khan", status: "Active" },
  { id: "br-3", code: "ISB", name: "Islamabad Branch", address: "Blue Area, Islamabad", manager: "Sana Malik", status: "Active" },
  { id: "br-4", code: "FSD", name: "Faisalabad Warehouse", address: "Industrial Estate, Faisalabad", manager: "Usman Tariq", status: "Inactive" },
];

export const DEPARTMENTS: Department[] = [
  { id: "dep-1", code: "FIN", name: "Finance" },
  { id: "dep-2", code: "PRC", name: "Procurement" },
  { id: "dep-3", code: "SLS", name: "Sales & Marketing" },
  { id: "dep-4", code: "PRD", name: "Production" },
  { id: "dep-5", code: "STR", name: "Stores / Warehouse" },
  { id: "dep-6", code: "HR", name: "Human Resources" },
];

export const WAREHOUSES: Warehouse[] = [
  { id: "wh-1", code: "WH-KHI-01", name: "Karachi Main Warehouse", branchId: "br-1" },
  { id: "wh-2", code: "WH-LHR-01", name: "Lahore Warehouse", branchId: "br-2" },
  { id: "wh-3", code: "WH-ISB-01", name: "Islamabad Warehouse", branchId: "br-3" },
  { id: "wh-4", code: "WH-FSD-01", name: "Faisalabad Store", branchId: "br-4" },
];

export const CURRENCIES: Currency[] = [
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
];

export const EMPLOYEES: Employee[] = [
  { id: "emp-1", name: "Ahmed Raza", designation: "Finance Manager", departmentId: "dep-1" },
  { id: "emp-2", name: "Sana Malik", designation: "Chief Financial Officer", departmentId: "dep-1" },
  { id: "emp-3", name: "Bilal Khan", designation: "Procurement Officer", departmentId: "dep-2" },
  { id: "emp-4", name: "Usman Tariq", designation: "Store Keeper", departmentId: "dep-5" },
  { id: "emp-5", name: "Hina Sheikh", designation: "Accountant", departmentId: "dep-1" },
  { id: "emp-6", name: "Kashif Iqbal", designation: "Sales Executive", departmentId: "dep-3" },
  { id: "emp-7", name: "Zara Ahmed", designation: "Production Supervisor", departmentId: "dep-4" },
];

export const VENDORS: Vendor[] = [
  { id: "v-1", code: "VEN-001", name: "Al-Habib Textile Mills", taxRegNo: "STRN-1234567", ntn: "1234567-8", paymentTerms: "Net 30", address: "SITE Area, Karachi", phone: "021-32345678", email: "accounts@alhabibtextile.com", status: "Active" },
  { id: "v-2", code: "VEN-002", name: "Crescent Fabrics Ltd", taxRegNo: "STRN-2234567", ntn: "2234567-8", paymentTerms: "Net 45", address: "Faisalabad Road, Faisalabad", phone: "041-2345678", email: "finance@crescentfabrics.com", status: "Active" },
  { id: "v-3", code: "VEN-003", name: "Sialkot Trims & Accessories", taxRegNo: "STRN-3234567", ntn: "3234567-8", paymentTerms: "Net 15", address: "Small Industrial Estate, Sialkot", phone: "052-3456789", email: "sales@sialkottrims.com", status: "Active" },
  { id: "v-4", code: "VEN-004", name: "Bin Qasim Chemicals", taxRegNo: "STRN-4234567", ntn: "4234567-8", paymentTerms: "Net 30", address: "Port Qasim, Karachi", phone: "021-34567890", email: "info@binqasimchem.com", status: "Active" },
  { id: "v-5", code: "VEN-005", name: "Punjab Packaging Co", taxRegNo: "STRN-5234567", ntn: "5234567-8", paymentTerms: "Net 60", address: "Multan Road, Lahore", phone: "042-3567890", email: "orders@punjabpackaging.com", status: "Active" },
  { id: "v-6", code: "VEN-006", name: "Northern Yarn Suppliers", taxRegNo: "STRN-6234567", ntn: "6234567-8", paymentTerms: "Net 30", address: "Ring Road, Peshawar", phone: "091-3678901", email: "accounts@northernyarn.com", status: "Inactive" },
];

export const CUSTOMERS: Customer[] = [
  { id: "c-1", code: "CUS-001", name: "Metro Retail Group", taxRegNo: "STRN-9001234", ntn: "9001234-1", billingAddress: "Clifton, Karachi", shippingAddress: "Clifton, Karachi", phone: "021-35678901", email: "purchasing@metroretail.pk", creditLimit: 5000000, paymentTerms: "Net 30", status: "Active" },
  { id: "c-2", code: "CUS-002", name: "Al-Fateh Stores", taxRegNo: "STRN-9002345", ntn: "9002345-2", billingAddress: "Gulshan-e-Iqbal, Karachi", shippingAddress: "Gulshan-e-Iqbal, Karachi", phone: "021-36789012", email: "accounts@alfateh.pk", creditLimit: 2500000, paymentTerms: "Net 15", status: "Active" },
  { id: "c-3", code: "CUS-003", name: "Lahore Garments Export", taxRegNo: "STRN-9003456", ntn: "9003456-3", billingAddress: "Shadman, Lahore", shippingAddress: "Shadman, Lahore", phone: "042-37890123", email: "finance@lgexport.pk", creditLimit: 8000000, paymentTerms: "Net 45", status: "Active" },
  { id: "c-4", code: "CUS-004", name: "Sunrise Apparel Trading", taxRegNo: "STRN-9004567", ntn: "9004567-4", billingAddress: "DHA Phase 5, Lahore", shippingAddress: "DHA Phase 5, Lahore", phone: "042-38901234", email: "ap@sunriseapparel.pk", creditLimit: 3500000, paymentTerms: "Net 30", status: "Active" },
  { id: "c-5", code: "CUS-005", name: "Capital Mart", taxRegNo: "STRN-9005678", ntn: "9005678-5", billingAddress: "F-7 Markaz, Islamabad", shippingAddress: "F-7 Markaz, Islamabad", phone: "051-2890123", email: "accounts@capitalmart.pk", creditLimit: 1500000, paymentTerms: "Net 15", status: "Active" },
  { id: "c-6", code: "CUS-006", name: "Horizon Fashion House", taxRegNo: "STRN-9006789", ntn: "9006789-6", billingAddress: "Model Town, Lahore", shippingAddress: "Model Town, Lahore", phone: "042-39012345", email: "billing@horizonfashion.pk", creditLimit: 4000000, paymentTerms: "Net 30", status: "Inactive" },
];

export const BANK_ACCOUNTS: BankAccount[] = [
  { id: "bank-1", name: "MCB Main Account", type: "Bank", bankName: "MCB Bank Ltd", accountNo: "0123456789012", branchId: "br-1", openingBalance: 12500000 },
  { id: "bank-2", name: "HBL Operating Account", type: "Bank", bankName: "Habib Bank Ltd", accountNo: "0234567890123", branchId: "br-1", openingBalance: 6800000 },
  { id: "bank-3", name: "UBL Lahore Account", type: "Bank", bankName: "United Bank Ltd", accountNo: "0345678901234", branchId: "br-2", openingBalance: 4200000 },
  { id: "cash-1", name: "Head Office Cash", type: "Cash", branchId: "br-1", openingBalance: 350000 },
  { id: "cash-2", name: "Lahore Petty Cash", type: "Cash", branchId: "br-2", openingBalance: 120000 },
];

export const INVENTORY_ITEMS: InventoryItem[] = [
  { id: "it-1", code: "RM-COTN-30", name: "Cotton Yarn 30/1 Combed", unit: "KG", category: "Raw Material", standardRate: 850 },
  { id: "it-2", code: "RM-POLY-40", name: "Polyester Yarn 40/1", unit: "KG", category: "Raw Material", standardRate: 620 },
  { id: "it-3", code: "FAB-DENIM-12", name: "Denim Fabric 12oz", unit: "MTR", category: "Fabric", standardRate: 1450 },
  { id: "it-4", code: "FAB-JERSEY-180", name: "Cotton Jersey 180GSM", unit: "MTR", category: "Fabric", standardRate: 780 },
  { id: "it-5", code: "TRM-BTN-001", name: "Plastic Button 18L", unit: "GROSS", category: "Trims", standardRate: 320 },
  { id: "it-6", code: "TRM-ZIP-007", name: "YKK Zipper 7 inch", unit: "PCS", category: "Trims", standardRate: 45 },
  { id: "it-7", code: "PKG-POLY-BAG", name: "Polybag - Medium", unit: "PCS", category: "Packaging", standardRate: 8 },
  { id: "it-8", code: "PKG-CARTON-L", name: "Export Carton - Large", unit: "PCS", category: "Packaging", standardRate: 145 },
  { id: "it-9", code: "CHM-DYE-BLK", name: "Reactive Dye - Black", unit: "KG", category: "Chemicals", standardRate: 1250 },
  { id: "it-10", code: "FG-TSHIRT-M", name: "Finished T-Shirt - Medium", unit: "PCS", category: "Finished Goods", standardRate: 650 },
  { id: "it-11", code: "FG-JEANS-32", name: "Finished Jeans - Size 32", unit: "PCS", category: "Finished Goods", standardRate: 1850 },
  { id: "it-12", code: "RM-COTN-20", name: "Cotton Yarn 20/1 Carded", unit: "KG", category: "Raw Material", standardRate: 720 },
];

export const TAX_RATES: TaxRate[] = [
  { id: "tax-1", name: "Standard Sales Tax", type: "Sales Tax", rate: 18, account: "2210 - Sales Tax Payable", status: "Active" },
  { id: "tax-2", name: "Reduced Sales Tax (Textile)", type: "Sales Tax", rate: 12, account: "2210 - Sales Tax Payable", status: "Active" },
  { id: "tax-3", name: "Zero Rated (Export)", type: "Sales Tax", rate: 0, account: "2210 - Sales Tax Payable", status: "Active" },
  { id: "tax-4", name: "WHT on Supplies (Filer)", type: "WHT", rate: 4.5, account: "2220 - WHT Payable", status: "Active" },
  { id: "tax-5", name: "WHT on Supplies (Non-Filer)", type: "WHT", rate: 9, account: "2220 - WHT Payable", status: "Active" },
  { id: "tax-6", name: "WHT on Services (Filer)", type: "WHT", rate: 10, account: "2220 - WHT Payable", status: "Active" },
];

export const COST_CENTERS: CostCenter[] = [
  { id: "cc-1", code: "CC-100", name: "Corporate / Head Office", branchId: "br-1", manager: "Sana Malik", budget: 20000000, status: "Active" },
  { id: "cc-2", code: "CC-200", name: "Production Floor", branchId: "br-1", manager: "Zara Ahmed", budget: 45000000, status: "Active" },
  { id: "cc-3", code: "CC-300", name: "Sales & Distribution - Lahore", branchId: "br-2", manager: "Bilal Khan", budget: 15000000, status: "Active" },
  { id: "cc-4", code: "CC-400", name: "Warehouse & Logistics", branchId: "br-1", manager: "Usman Tariq", budget: 8000000, status: "Active" },
  { id: "cc-5", code: "CC-500", name: "Islamabad Regional Office", branchId: "br-3", manager: "Sana Malik", budget: 6000000, status: "Inactive" },
];

// A representative Chart of Accounts tree (spec: Asset/Liability/Equity/Revenue/Expense, with
// parent/child hierarchy). Deliberately not exhaustive — enough depth (3 levels) to demonstrate
// tree view, search, add/edit and duplicate-code validation.
export const CHART_OF_ACCOUNTS: AccountNode[] = [
  { id: "a-1000", code: "1000", name: "Assets", type: "Asset", parentId: null, nature: "Debit", status: "Active" },
  { id: "a-1100", code: "1100", name: "Current Assets", type: "Asset", parentId: "a-1000", nature: "Debit", status: "Active" },
  { id: "a-1110", code: "1110", name: "Cash & Bank", type: "Asset", parentId: "a-1100", nature: "Debit", status: "Active" },
  { id: "a-1120", code: "1120", name: "Accounts Receivable", type: "Asset", parentId: "a-1100", nature: "Debit", status: "Active" },
  { id: "a-1130", code: "1130", name: "Advance to Suppliers", type: "Asset", parentId: "a-1100", nature: "Debit", status: "Active" },
  { id: "a-1140", code: "1140", name: "Inventory", type: "Asset", parentId: "a-1100", nature: "Debit", status: "Active" },
  { id: "a-1200", code: "1200", name: "Fixed Assets", type: "Asset", parentId: "a-1000", nature: "Debit", status: "Active" },
  { id: "a-1210", code: "1210", name: "Property, Plant & Equipment", type: "Asset", parentId: "a-1200", nature: "Debit", status: "Active" },
  { id: "a-1220", code: "1220", name: "Accumulated Depreciation", type: "Asset", parentId: "a-1200", nature: "Credit", status: "Active" },
  { id: "a-2000", code: "2000", name: "Liabilities", type: "Liability", parentId: null, nature: "Credit", status: "Active" },
  { id: "a-2100", code: "2100", name: "Current Liabilities", type: "Liability", parentId: "a-2000", nature: "Credit", status: "Active" },
  { id: "a-2110", code: "2110", name: "Accounts Payable", type: "Liability", parentId: "a-2100", nature: "Credit", status: "Active" },
  { id: "a-2120", code: "2120", name: "Advance from Customers", type: "Liability", parentId: "a-2100", nature: "Credit", status: "Active" },
  { id: "a-2210", code: "2210", name: "Sales Tax Payable", type: "Liability", parentId: "a-2100", nature: "Credit", status: "Active" },
  { id: "a-2220", code: "2220", name: "WHT Payable", type: "Liability", parentId: "a-2100", nature: "Credit", status: "Active" },
  { id: "a-3000", code: "3000", name: "Equity", type: "Equity", parentId: null, nature: "Credit", status: "Active" },
  { id: "a-3100", code: "3100", name: "Share Capital", type: "Equity", parentId: "a-3000", nature: "Credit", status: "Active" },
  { id: "a-3200", code: "3200", name: "Retained Earnings", type: "Equity", parentId: "a-3000", nature: "Credit", status: "Active" },
  { id: "a-4000", code: "4000", name: "Revenue", type: "Revenue", parentId: null, nature: "Credit", status: "Active" },
  { id: "a-4100", code: "4100", name: "Sales Revenue - Local", type: "Revenue", parentId: "a-4000", nature: "Credit", status: "Active" },
  { id: "a-4200", code: "4200", name: "Sales Revenue - Export", type: "Revenue", parentId: "a-4000", nature: "Credit", status: "Active" },
  { id: "a-4300", code: "4300", name: "Other Income", type: "Revenue", parentId: "a-4000", nature: "Credit", status: "Active" },
  { id: "a-5000", code: "5000", name: "Expenses", type: "Expense", parentId: null, nature: "Debit", status: "Active" },
  { id: "a-5100", code: "5100", name: "Cost of Sales", type: "Expense", parentId: "a-5000", nature: "Debit", status: "Active" },
  { id: "a-5200", code: "5200", name: "Administrative Expenses", type: "Expense", parentId: "a-5000", nature: "Debit", status: "Active" },
  { id: "a-5300", code: "5300", name: "Selling & Distribution Expenses", type: "Expense", parentId: "a-5000", nature: "Debit", status: "Active" },
  { id: "a-5400", code: "5400", name: "Depreciation Expense", type: "Expense", parentId: "a-5000", nature: "Debit", status: "Active" },
  { id: "a-5500", code: "5500", name: "Financial Charges", type: "Expense", parentId: "a-5000", nature: "Debit", status: "Active" },
];

export const PAYMENT_METHODS = ["Bank Transfer", "Cheque", "Cash", "Online Transfer", "Credit Card"] as const;

export function branchName(id: string): string { return BRANCHES.find((b) => b.id === id)?.name ?? "—"; }
export function warehouseName(id: string): string { return WAREHOUSES.find((w) => w.id === id)?.name ?? "—"; }
export function vendorName(id: string): string { return VENDORS.find((v) => v.id === id)?.name ?? "—"; }
export function customerName(id: string): string { return CUSTOMERS.find((c) => c.id === id)?.name ?? "—"; }
export function departmentName(id: string): string { return DEPARTMENTS.find((d) => d.id === id)?.name ?? "—"; }
export function accountLabel(id: string): string {
  const a = CHART_OF_ACCOUNTS.find((x) => x.id === id);
  return a ? `${a.code} - ${a.name}` : "—";
}
