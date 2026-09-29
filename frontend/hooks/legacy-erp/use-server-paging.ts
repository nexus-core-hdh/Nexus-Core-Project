"use client";

import { useEffect, useRef, useState } from "react";
import type { PageRequest } from "@/lib/nexuscore-api";

// Server-side paging state for the legacy ERP list screens. Search, filters and sorting are
// applied by the API before paging (see nexuscore-backend legacy-erp/list-paging.util.ts), so a
// list screen can reach every record, not just the first page the API used to cap at.
//
// Usage: pass `paging.request` (or `paging.firstPage()` for a new search/filter) to the list API,
// unwrap the response with `paging.take(response)`, and point `paging.reloadRef.current` at the
// screen's own load function — it is called whenever page, page size or sort changes.
export function useServerPaging(opts: { defaultSortBy: string; defaultSortDir?: "asc" | "desc"; defaultPageSize?: number }) {
  const [state, setState] = useState<PageRequest>({
    page: 1,
    pageSize: opts.defaultPageSize ?? 50,
    sortBy: opts.defaultSortBy,
    sortDir: opts.defaultSortDir ?? "asc",
  });
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const reloadRef = useRef<(() => void) | null>(null);
  const skipNextReload = useRef(true); // the screen does its own initial load

  useEffect(() => {
    if (skipNextReload.current) {
      skipNextReload.current = false;
      return;
    }
    reloadRef.current?.();
  }, [state]);

  /** Request for a new query (search/filter/worklist change): always page 1, loaded once. */
  const firstPage = (): PageRequest => {
    if (state.page !== 1) {
      skipNextReload.current = true;
      setState((s) => ({ ...s, page: 1 }));
    }
    return { ...state, page: 1 };
  };

  /** Rows of a PagedResponse (recording total/pageCount); a plain array is accepted as one page. */
  const take = (r: any): any[] => {
    if (r && Array.isArray(r.rows)) {
      setTotal(Number(r.total) || 0);
      setPageCount(Math.max(1, Number(r.pageCount) || 1));
      return r.rows;
    }
    const rows = Array.isArray(r) ? r : [];
    setTotal(rows.length);
    setPageCount(1);
    return rows;
  };

  const toggleSort = (key: string) =>
    setState((s) =>
      s.sortBy === key
        ? { ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc", page: 1 }
        : { ...s, sortBy: key, sortDir: "asc", page: 1 },
    );

  return {
    ...state,
    request: state,
    firstPage,
    take,
    toggleSort,
    setPage: (page: number) => setState((s) => ({ ...s, page })),
    setPageSize: (pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })),
    total,
    pageCount,
    reloadRef,
  };
}

export type ServerPaging = ReturnType<typeof useServerPaging>;
