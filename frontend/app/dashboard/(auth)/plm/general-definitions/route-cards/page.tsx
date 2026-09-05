"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { Plus, Search } from "lucide-react";

// Route Definitions list — existing RouteCard/RouteCardLine Prisma master (plmApi.routeCards),
// same data this screen already managed via an accordion+dialog layout; only the presentation
// changes here (dense ERP list -> per-record detail page at ./[id]), matching the reference
// legacy screen's own List + Detail workspace-tab pair.
export default function RouteCardsListPage() {
  const router = useRouter();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const c = await plmApi.routeCards.list({ branchId: user?.branchId });
      setCards(Array.isArray(c) ? c : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.code?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q));
  }, [cards, search]);

  const open = (id: string) => navigateOrOpenTab(router, `/dashboard/plm/general-definitions/route-cards/${id}`);

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">General Definitions</p>
          <h1 className="text-[17px] font-semibold leading-tight">Route Definitions</h1>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={() => open("new")}>
          <Plus className="h-3.5 w-3.5 mr-1" />New Route
        </Button>
      </div>

      <InputGroup className="h-8 max-w-xs">
        <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
        <InputGroupInput placeholder="Search code or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="text-xs" />
      </InputGroup>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[700px] table-fixed border-collapse text-[12px]">
          <thead>
            <tr className="[&>th]:border-r [&>th]:border-b [&>th]:bg-muted/50 [&>th]:px-2 [&>th]:h-8 [&>th]:text-left [&>th]:text-[10.5px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground/90">
              <th style={{ width: 140 }}>Code</th>
              <th>Name</th>
              <th style={{ width: 120 }}>Service Code</th>
              <th style={{ width: 90 }} className="text-center">Processes</th>
              <th style={{ width: 90 }} className="text-center">In Use</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="[&>td]:border-r [&>td]:border-b [&>td]:p-1.5">
                  {Array.from({ length: 5 }).map((_, j) => <td key={j}><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No routes found.</td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer [&>td]:border-r [&>td]:border-b [&>td]:px-2 [&>td]:h-8 hover:bg-accent/40" onClick={() => open(c.id)}>
                  <td className="font-mono">{c.code}</td>
                  <td className="truncate">{c.name}</td>
                  <td className="text-muted-foreground">{c.serviceCode || "—"}</td>
                  <td className="text-center text-muted-foreground">{c.lines?.length ?? 0}</td>
                  <td className="text-center">
                    <Badge variant={c.inUse ? "default" : "secondary"} className="text-[10px] font-normal">{c.inUse ? "Active" : "Inactive"}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
