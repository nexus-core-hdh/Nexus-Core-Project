"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ServerPaging } from "@/hooks/legacy-erp/use-server-paging";

const PAGE_SIZES = [25, 50, 100, 200];

/** Footer for a server-paged legacy ERP list (see hooks/legacy-erp/use-server-paging.ts). */
export function ListPager({ paging, loading }: { paging: ServerPaging; loading?: boolean }) {
  const { page, pageCount, pageSize, total } = paging;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p: number) => paging.setPage(Math.min(Math.max(1, p), pageCount));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
      <span>
        {total === 0 ? "No records" : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => paging.setPageSize(Number(v))} disabled={loading}>
            <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span>Page {page.toLocaleString()} of {pageCount.toLocaleString()}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => go(1)} disabled={loading || page <= 1} title="First page"><ChevronsLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => go(page - 1)} disabled={loading || page <= 1} title="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => go(page + 1)} disabled={loading || page >= pageCount} title="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => go(pageCount)} disabled={loading || page >= pageCount} title="Last page"><ChevronsRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
