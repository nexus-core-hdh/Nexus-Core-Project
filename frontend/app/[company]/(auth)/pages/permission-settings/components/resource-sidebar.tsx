"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { PermissionResource, collectPermissionLeaves } from "../utils/permission-tree";

interface ResourceSidebarProps {
  selectedResource: string | null;
  onResourceSelect: (path: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  permissionTree: PermissionResource[];
}

export function ResourceSidebar({
  selectedResource,
  onResourceSelect,
  searchQuery,
  onSearchChange,
  permissionTree,
}: ResourceSidebarProps) {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() =>
    new Set(permissionTree.filter((r) => r.type === "SECTION").map((r) => r.path))
  );

  React.useEffect(() => {
    setExpandedCategories(new Set(permissionTree.filter((r) => r.type === "SECTION").map((r) => r.path)));
  }, [permissionTree]);

  const getResourceIcon = (type: string) => {
    const icons: Record<string, string> = {
      MENU: "📁",
      PAGE: "📄",
      SECTION: "📋",
      FIELD: "🔧",
    };
    return icons[type] || "•";
  };

  /** Top-level nav groups (Dashboards, Apps, …) with only leaf permission rows inside. */
  const sectionsWithLeaves = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return permissionTree
      .filter((node) => node.type === "SECTION" && node.children?.length)
      .map((section) => {
        const leaves = collectPermissionLeaves(section);
        const filteredLeaves = q
          ? leaves.filter(
              (leaf) =>
                leaf.name.toLowerCase().includes(q) || leaf.path.toLowerCase().includes(q)
            )
          : leaves;
        return { section, leaves: filteredLeaves };
      })
      .filter(({ leaves }) => leaves.length > 0);
  }, [permissionTree, searchQuery]);

  return (
    <div className="w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-full text-sidebar-foreground">
      <div className="px-3 pt-3 pb-2 border-b border-sidebar-border bg-sidebar">
        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
          Sections
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8 text-sm bg-background border-input shadow-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sectionsWithLeaves.map(({ section, leaves }) => {
          const isExpanded = expandedCategories.has(section.path);
          const sectionIsScope = selectedResource === section.path;
          return (
            <Collapsible
              key={section.path}
              open={isExpanded}
              onOpenChange={(open) => {
                setExpandedCategories((prev) => {
                  const next = new Set(prev);
                  if (open) next.add(section.path);
                  else next.delete(section.path);
                  return next;
                });
              }}
            >
              <div className="px-2 pt-2 pb-1">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`w-full justify-start text-xs font-semibold hover:text-sidebar-foreground hover:bg-sidebar-accent ${
                      sectionIsScope
                        ? "text-foreground bg-sidebar-accent/80"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => onResourceSelect(section.path)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="mr-2 h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="mr-2 h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1 text-left">{section.name}</span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="space-y-1 pb-2">
                  {leaves.map((leaf) => {
                    const isSelected = selectedResource === leaf.path;
                    return (
                      <Button
                        key={leaf.path}
                        variant="ghost"
                        className={`
                          w-full justify-start rounded-none border-l-[3px] border-transparent
                          text-sm font-normal h-9 px-3 pl-4
                          ${
                            isSelected
                              ? "bg-background border-l-primary text-foreground ring-1 ring-primary/15 ring-inset"
                              : "hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
                          }
                        `}
                        onClick={() => onResourceSelect(leaf.path)}
                      >
                        <span className="mr-2 shrink-0 opacity-80">{getResourceIcon(leaf.type)}</span>
                        <span className="flex-1 text-left truncate">{leaf.name}</span>
                      </Button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}














