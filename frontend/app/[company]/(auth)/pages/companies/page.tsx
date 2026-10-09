'use client';

import { useEffect, useState } from "react";
import { companiesApi } from "@/lib/api";

import CompaniesDataTable, { Company } from "./data-table";

export default function Page() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getCompanies = async () => {
    try {
      setIsLoading(true);
      const data = await companiesApi.getCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getCompanies();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">
            Manage companies and their branches. Each company has a unique URL.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading companies...</p>
        </div>
      ) : (
        <CompaniesDataTable data={companies} />
      )}
    </>
  );
}