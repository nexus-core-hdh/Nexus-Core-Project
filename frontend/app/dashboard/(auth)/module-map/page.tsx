"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronRight,
  Compass,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Palette,
  Search,
  Settings2,
  UserCircle,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { allSections, workflowExamples, type MapItem } from "./module-map-data";

const SCREEN_TYPES = [
  "Worklist",
  "Master Data",
  "Transaction",
  "Document",
  "Detail",
  "Form",
  "Lookup",
  "Statement",
  "Report / Dashboard",
];

const GLOBAL_NAV = [
  { label: "Dashboard", desc: "Operational overview", icon: LayoutDashboard },
  { label: "Search", desc: "Global search (Cmd+K)", icon: Search },
  { label: "Workspace Tabs", desc: "Multi tasking", icon: ListChecks },
  { label: "Themes & Layout", desc: "Appearance settings", icon: Palette },
  { label: "User Menu", desc: "Profile & preferences", icon: UserCircle },
  { label: "Quick Actions", desc: "Create / add quickly", icon: Zap },
];

function ItemRow({ item, onNavigate }: { item: MapItem; onNavigate: (href: string) => void }) {
  const available = item.href !== "#";
  return (
    <li>
      <button
        type="button"
        disabled={!available}
        onClick={() => available && onNavigate(item.href)}
        title={available ? undefined : "Not available yet"}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-[11px] leading-tight transition-colors",
          available
            ? "text-foreground/80 hover:bg-primary/10 hover:text-primary cursor-pointer"
            : "text-muted-foreground/50 cursor-default"
        )}>
        <span
          className={cn(
            "block size-1 shrink-0 rounded-full",
            available ? "bg-primary" : "bg-muted-foreground/30"
          )}
        />
        <span className="truncate">{item.label}</span>
      </button>
    </li>
  );
}

export default function ModuleMapPage() {
  const router = useRouter();
  const onNavigate = React.useCallback((href: string) => navigateOrOpenTab(router, href), [router]);

  const allCards = React.useMemo(() => allSections.flatMap((s) => s.cards), []);
  const allItems = React.useMemo(() => allCards.flatMap((c) => c.categories.flatMap((cat) => cat.items)), [allCards]);
  const availableCount = React.useMemo(() => allItems.filter((i) => i.href !== "#").length, [allItems]);

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      {/* Branded info rail — page-local, distinct from the app's collapsible AppSidebar which
          remains untouched above this content region. */}
      <aside className="shrink-0 rounded-lg border bg-slate-950 p-6 text-slate-100 xl:w-[260px]">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/20 ring-primary/30 flex size-9 items-center justify-center rounded-lg ring-1">
            <MapIcon className="text-primary size-4.5" />
          </div>
          <div>
            <p className="text-sm leading-tight font-semibold text-white">Nexus Core</p>
            <p className="text-[11px] text-slate-400">Enterprise ERP</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-primary text-[11px] font-semibold tracking-wide uppercase">Information Architecture Map</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">Complete modules & screens</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-lg leading-none font-bold text-white">{allCards.length}</p>
            <p className="mt-1 text-[10px] text-slate-400">Module Cards</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-lg leading-none font-bold text-white">{allItems.length}</p>
            <p className="mt-1 text-[10px] text-slate-400">Screens Mapped</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-lg leading-none font-bold text-emerald-400">{availableCount}</p>
            <p className="mt-1 text-[10px] text-slate-400">Available Now</p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-lg leading-none font-bold text-white">{allSections.length}</p>
            <p className="mt-1 text-[10px] text-slate-400">Business Areas</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold text-slate-300">Screen Types</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {SCREEN_TYPES.map((t) => (
              <span key={t} className="rounded-sm border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold text-slate-300">Navigation Pattern</p>
          <div className="mt-2 space-y-1.5 text-[10px] text-slate-400">
            <div className="flex items-center gap-1">
              <Compass className="size-3 shrink-0" />
              Module → Sub Module → Screen
            </div>
            <div className="flex items-center gap-1">
              <Search className="size-3 shrink-0" />
              Lookup → Select → Return
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold text-slate-300">Availability</p>
          <div className="mt-2 space-y-1.5 text-[10px]">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="bg-primary block size-1.5 rounded-full" />
              Available — real screen, opens directly
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="block size-1.5 rounded-full bg-slate-700" />
              Not available yet — no screen built
            </div>
          </div>
        </div>

        <p className="mt-8 text-[10px] text-slate-600">Built for Textile & Apparel Industry</p>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>Dashboards</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">Complete Module Map</span>
            </div>
            <h1 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">Nexus Core ERP — Complete Map</h1>
            <p className="text-muted-foreground mt-0.5 text-xs">All modules, sub modules & screens in one place</p>
          </div>
          <Badge variant="outline" className="text-muted-foreground w-fit gap-1.5 font-normal">
            <span className="bg-primary block size-1.5 rounded-full" />
            {availableCount} of {allItems.length} screens available now
          </Badge>
        </div>

        {/* Global navigation strip */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3 lg:grid-cols-6">
          {GLOBAL_NAV.map(({ label, desc, icon: Icon }) => (
            <div key={label} className="flex items-start gap-2 px-1">
              <div className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{label}</p>
                <p className="text-muted-foreground truncate text-[10px]">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {allSections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="text-primary text-xs font-semibold tracking-wide uppercase">{section.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.number} className="flex flex-col gap-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold">
                        {card.number}
                      </span>
                      <Icon className="text-primary size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] leading-tight font-semibold">{card.title}</p>
                        <p className="text-muted-foreground truncate text-[10px]">{card.subtitle}</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {card.categories.map((cat) => (
                        <div key={cat.title}>
                          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                            {cat.title}
                          </p>
                          <ul className="space-y-0.5">
                            {cat.items.map((item) => (
                              <ItemRow key={item.label} item={item} onNavigate={onNavigate} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Workflow examples */}
        <div className="space-y-3">
          <h2 className="text-primary text-xs font-semibold tracking-wide uppercase">Workflow Examples</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {workflowExamples.map((flow) => (
              <div key={flow.title} className="rounded-lg border p-3">
                <p className="mb-2 text-[11px] font-semibold">{flow.title}</p>
                <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-[10px]">
                  {flow.steps.map((step, i) => (
                    <React.Fragment key={step}>
                      <span>{step}</span>
                      {i < flow.steps.length - 1 && <ChevronRight className="size-2.5 shrink-0" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-muted-foreground flex flex-col items-center gap-1 border-t pt-4 text-center text-[10px]">
          <p>Nexus Core Enterprise ERP — Plan. Produce. Perform.</p>
          <p>This map reflects the real, currently wired frontend routes. Unavailable items have no screen built yet.</p>
        </div>
      </div>
    </div>
  );
}
