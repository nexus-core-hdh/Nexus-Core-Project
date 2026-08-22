import { Injectable } from '@nestjs/common';
import { HEADER_COLUMNS as PURCHASE_RECEIPT_COLUMNS } from './inventory-receipt.service';
import { HEADER_COLUMNS as YARN_CARD_COLUMNS } from './yarn-card.service';
import { HEADER_COLUMNS as FABRIC_CARD_COLUMNS } from './fabric-card.service';
import { HEADER_COLUMNS as CURRENT_ACCOUNT_COLUMNS } from './account.service';
import { WAREHOUSE_COLUMNS } from './warehouse.service';
import { HEADER_COLUMNS as FINANCIAL_RECEIPT_COLUMNS } from './fi-receipt.service';
import { HEADER_COLUMNS as TRIM_CARD_COLUMNS } from './trim-card.service';
import { HEADER_COLUMNS as TRIM_INVENTORY_CARD_COLUMNS } from './trim-inventory-card.service';
import { HEADER_COLUMNS as PURCHASE_ORDER_COLUMNS } from './purchase-order.service';
import { HEADER_COLUMNS as CONTRACT_COLUMNS } from './contract.service';
import { HEADER_COLUMNS as SIZE_SET_COLUMNS } from './size-set.service';
import { HEADER_COLUMNS as UNIT_SET_COLUMNS } from './unit-set.service';
import { INVENTORY_CARD_COLUMNS } from './inventory-card.service';

export type WorklistSourceKey =
  | 'purchase-receipt' | 'yarn-card' | 'fabric-card' | 'current-account' | 'warehouse' | 'financial-receipt'
  | 'trim-card' | 'trim-inventory-card' | 'purchase-order' | 'contract' | 'size-set' | 'unit-set' | 'inventory-card';

export interface WorklistSourceFields {
  source: WorklistSourceKey;
  label: string;
  fields: readonly string[];
}

// Read-only field metadata for every Legacy ERP "Customize Worklist" designer — originally just
// the Receipt & Master Data screen (see receipt-master-data/page.tsx + worklist-design-modal.tsx),
// now shared by every per-entity list screen too. No DB query — this just re-exposes each owning
// service's own already-existing raw column list (the exact same PascalCase names each screen's
// own SELECT already returns as row keys), so the worklist picker and the grid always agree on
// what a given field key means. No new table, no new column, no duplicated data source.
const SOURCES: WorklistSourceFields[] = [
  { source: 'purchase-receipt', label: 'Purchase Receipt List', fields: PURCHASE_RECEIPT_COLUMNS },
  { source: 'yarn-card', label: 'Yarn Card List', fields: YARN_CARD_COLUMNS },
  { source: 'fabric-card', label: 'Fabric Card List', fields: FABRIC_CARD_COLUMNS },
  { source: 'current-account', label: 'Current Account List', fields: CURRENT_ACCOUNT_COLUMNS },
  { source: 'warehouse', label: 'Warehouse List', fields: WAREHOUSE_COLUMNS },
  { source: 'financial-receipt', label: 'Financial Receipt List', fields: FINANCIAL_RECEIPT_COLUMNS },
  { source: 'trim-card', label: 'Trim Card List', fields: TRIM_CARD_COLUMNS },
  { source: 'trim-inventory-card', label: 'Trim Inventory Card List', fields: TRIM_INVENTORY_CARD_COLUMNS },
  { source: 'purchase-order', label: 'Purchase Order List', fields: PURCHASE_ORDER_COLUMNS },
  { source: 'contract', label: 'Contract List', fields: CONTRACT_COLUMNS },
  { source: 'size-set', label: 'Size List', fields: SIZE_SET_COLUMNS },
  { source: 'unit-set', label: 'Unit Set List', fields: UNIT_SET_COLUMNS },
  { source: 'inventory-card', label: 'Inventory Card List', fields: INVENTORY_CARD_COLUMNS },
];

// Scopes the field picker to one screen's own source(s) when that screen's page.tsx passes its
// own `primaryTable` as `primary` (see worklist-fields.controller.ts). Receipt & Master Data /
// Financial Receipt & Master Data never pass `primary`, so `list()` keeps returning every source
// for them exactly as before — this is purely additive. Keyed by the same screen-specific
// `primaryTable` strings worklist-rows.service.ts's LIST_SCREEN_TABLES uses, so a page only ever
// needs to know its own one key.
const ALLOWED_SOURCES_BY_PRIMARY: Partial<Record<string, WorklistSourceKey[]>> = {
  'yarn-card-list': ['yarn-card'],
  'fabric-card-list': ['fabric-card'],
  'trim-inventory-card-list': ['trim-inventory-card'],
  'current-account-list': ['current-account'],
  'warehouse-list': ['warehouse'],
  'trim-card-list': ['trim-card'],
  'purchase-order-list': ['purchase-order'],
  'size-set-list': ['size-set'],
  'unit-set-list': ['unit-set'],
  'purchase-contract-list': ['contract'],
  'sale-contract-list': ['contract'],
  'inventory-card-list': ['inventory-card'],
};

@Injectable()
export class WorklistFieldsService {
  list(primary?: string): WorklistSourceFields[] {
    if (!primary) return SOURCES;
    const allowed = ALLOWED_SOURCES_BY_PRIMARY[primary];
    if (!allowed) return SOURCES; // unrecognized primary — fail open to today's unrestricted behavior
    return SOURCES.filter((sf) => allowed.includes(sf.source));
  }
}
