'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { companiesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { COMPANY_REGISTER_PLATFORM_ONLY } from "@/lib/companies/company-details";

import CompaniesDataTable, { Company, CompanyLoaderContext, CompaniesAccessContext } from "./data-table";
import { CreateCompanyButton } from "./create-company-form";

type Access = { isPlatformOwner: boolean; canCreate: boolean; canViewAll: boolean; canInviteAdmin: boolean; trialDefaultDays: number | null };
const NO_ACCESS: Access = { isPlatformOwner: false, canCreate: false, canViewAll: false, canInviteAdmin: false, trialDefaultDays: null };

// Companies: everyone sees their own company (GET /company). Users of the platform-owner company
// holding companies:read see every company, and with companies:create can register new ones —
// GET /companies/access says which; the backend authorizes each request again regardless.
export default function Page() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [access, setAccess] = useState<Access>(NO_ACCESS);

  const getCompanies = useCallback(async (currentAccess: Access) => {
    try {
      setIsLoading(true);
      const data: any = currentAccess.canViewAll ? await companiesApi.listAllCompanies() : await companiesApi.getCompanies();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const a = await companiesApi.getAccess().catch(() => NO_ACCESS);
      const resolved = { ...NO_ACCESS, ...(a ?? {}) };
      setAccess(resolved);
      await getCompanies(resolved);
    })();
  }, [getCompanies]);

  const ownCompanyId = String(getCurrentUser()?.companyId ?? ""); // a UUID string at runtime
  const loadCompany = useMemo(
    () => (id: string) => (access.canViewAll && id !== ownCompanyId ? companiesApi.getAnyCompany(id) : companiesApi.getCompany(id)),
    [access.canViewAll, ownCompanyId],
  );

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">
            Manage companies and their branches. Each company has a unique URL.
          </p>
        </div>
        {access.canCreate && <CreateCompanyButton onCreated={() => getCompanies(access)} trialDefaultDays={access.trialDefaultDays} canInviteAdmin={access.canInviteAdmin} />}
      </div>
      {!access.canCreate && (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{COMPANY_REGISTER_PLATFORM_ONLY}</p>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading companies...</p>
        </div>
      ) : (
        <CompanyLoaderContext.Provider value={loadCompany}>
          <CompaniesAccessContext.Provider value={{ canInviteAdmin: access.canInviteAdmin, ownCompanyId }}>
            <CompaniesDataTable data={companies} />
          </CompaniesAccessContext.Provider>
        </CompanyLoaderContext.Provider>
      )}
    </>
  );
}
