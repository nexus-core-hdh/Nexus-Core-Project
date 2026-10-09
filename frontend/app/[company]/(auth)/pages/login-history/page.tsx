'use client';

import { useEffect, useState } from "react";
import { loginHistoryApi } from "@/lib/api";
import LoginHistoryDataTable from "./data-table";

export default function Page() {
  const [loginHistory, setLoginHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const getLoginHistory = async () => {
    try {
      setIsLoading(true);
      const data = await loginHistoryApi.getLoginHistory();
      setLoginHistory(data);
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getLoginHistory();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Login History</h1>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading login history...</p>
        </div>
      ) : (
        <LoginHistoryDataTable data={loginHistory} />
      )}
    </>
  );
}



















