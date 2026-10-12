"use client";

import type { Table } from "@tanstack/react-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

/** Small status-filter dropdown for DataTable's toolbarExtra slot — wired to the table's own
 *  "status" column filter, used across every Finance Settings listing screen. */
export function StatusFilter<TData>({ table, options }: { table: Table<TData>; options: string[] }) {
  const column = table.getColumn("status");
  const value = (column?.getFilterValue() as string) ?? ALL;
  return (
    <Select value={value} onValueChange={(v) => column?.setFilterValue(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All Statuses</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
