import { BadRequestException } from '@nestjs/common';

/**
 * Modules that have user-defined reports. Each has its own permission set
 * (`<permission>:view|create|update|delete|export`), its own menu group (where the "Reports"
 * expander, "Manage Reports" and the per-source report sections are created) and its own
 * screens under `basePath` (list), `basePath/view?id=` and `basePath/designer?id=`.
 */
export interface ReportModuleConfig {
  key: string;
  label: string;
  permission: string;
  menuGroup: string;
  basePath: string;
}

export const REPORT_MODULES: Record<string, ReportModuleConfig> = {
  plm: { key: 'plm', label: 'PLM', permission: 'plm-reports', menuGroup: 'PLM', basePath: '/plm/reports' },
  'legacy-erp': {
    key: 'legacy-erp', label: 'Legacy ERP', permission: 'legacy-erp-reports', menuGroup: 'Legacy ERP', basePath: '/legacy-erp/reports',
  },
  docket: {
    key: 'docket', label: 'Docket Management', permission: 'docket-reports', menuGroup: 'Docket Management', basePath: '/dockets/reports',
  },
};

export function reportModule(key: string): ReportModuleConfig {
  const mod = REPORT_MODULES[key];
  if (!mod) throw new BadRequestException(`Unknown report module "${key}"`);
  return mod;
}

export const reportViewHref = (mod: ReportModuleConfig, id: string) => `${mod.basePath}/view?id=${id}`;
