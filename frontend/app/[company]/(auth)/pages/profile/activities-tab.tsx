"use client";

import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { BriefcaseBusinessIcon, BadgeCheckIcon, ClockIcon, UserIcon, FileIcon, MessageSquareIcon, SlidersHorizontal, X as XIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { activitiesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

interface Activity {
  id: number;
  type: string;
  message: string;
  entityType?: string;
  entityId?: number;
  userId?: number;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
  createdAt: string;
}

export function ActivitiesTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) {
          setLoading(false);
          return;
        }

        const data = await activitiesApi.getActivities({ userId: user.id });
        setActivities(data || []);
      } catch (error) {
        console.error("Failed to fetch activities:", error);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  // Get unique types and entity types for filters
  const uniqueTypes = useMemo(() => {
    const types = new Set(activities.map(a => a.type).filter(Boolean));
    return Array.from(types).sort();
  }, [activities]);

  const uniqueEntityTypes = useMemo(() => {
    const entityTypes = new Set(
      activities
        .map((a) => a.entityType)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    );
    return Array.from(entityTypes).sort();
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // Type filter
      if (filterType !== "all" && activity.type !== filterType) {
        return false;
      }

      // Entity type filter
      if (filterEntityType !== "all" && activity.entityType !== filterEntityType) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          activity.message.toLowerCase().includes(query) ||
          activity.type?.toLowerCase().includes(query) ||
          activity.entityType?.toLowerCase().includes(query) ||
          activity.company?.name.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [activities, filterType, filterEntityType, searchQuery]);

  const activeFiltersCount = (filterType !== "all" ? 1 : 0) + (filterEntityType !== "all" ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  const clearFilters = () => {
    setFilterType("all");
    setFilterEntityType("all");
    setSearchQuery("");
  };

  const getActivityIcon = (type: string) => {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('created') || typeLower.includes('uploaded')) {
      return BriefcaseBusinessIcon;
    }
    if (typeLower.includes('assigned') || typeLower.includes('user')) {
      return UserIcon;
    }
    if (typeLower.includes('commented') || typeLower.includes('message')) {
      return MessageSquareIcon;
    }
    if (typeLower.includes('updated') || typeLower.includes('status')) {
      return BadgeCheckIcon;
    }
    if (typeLower.includes('file') || typeLower.includes('document')) {
      return FileIcon;
    }
    return BriefcaseBusinessIcon;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">Loading activities...</div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">No activities found</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Activities</CardTitle>
          <div className="flex items-center gap-2">
            {/* Search input */}
            <div className="relative w-48">
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pr-8 text-xs"
              />
              {searchQuery && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2">
                  <XIcon className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 relative">
                  <SlidersHorizontal className="h-3 w-3" />
                  {activeFiltersCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="absolute -end-1.5 -top-1.5 size-4 rounded-full p-0 text-xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filters</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Type filter */}
                <DropdownMenuLabel className="text-xs text-muted-foreground">Type</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filterType === "all"}
                  onCheckedChange={() => setFilterType("all")}>
                  All Types
                </DropdownMenuCheckboxItem>
                {uniqueTypes.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={filterType === type}
                    onCheckedChange={() => setFilterType(type)}>
                    {type.replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                ))}

                {/* Entity type filter */}
                {uniqueEntityTypes.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Entity Type</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={filterEntityType === "all"}
                      onCheckedChange={() => setFilterEntityType("all")}>
                      All Entities
                    </DropdownMenuCheckboxItem>
                    {uniqueEntityTypes.map((entityType) => (
                      <DropdownMenuCheckboxItem
                        key={entityType}
                        checked={filterEntityType === entityType}
                        onCheckedChange={() => setFilterEntityType(entityType)}>
                        {entityType}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}

                {activeFiltersCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      <XIcon className="mr-2 h-4 w-4" />
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="ps-6">
        <ol className="relative border-s">
          {filteredActivities.length === 0 ? (
            <li className="ms-6">
              <div className="text-muted-foreground py-4 text-center text-sm">
                {loading ? "Loading activities..." : "No activities found"}
              </div>
            </li>
          ) : (
            filteredActivities.map((activity, index) => {
              const IconComponent = getActivityIcon(activity.type);
              const isLast = index === filteredActivities.length - 1;
              
              return (
                <li key={activity.id} className={`ms-6 ${isLast ? '' : 'mb-4'} space-y-1`}>
                  <span className="bg-muted absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full border">
                    <IconComponent className="text-primary size-2.5" />
                  </span>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-0.5">
                      <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-tight">
                        <span className="line-clamp-2">{activity.message}</span>
                        {activity.type && (
                          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                            {activity.type.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </h3>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
                        <ClockIcon className="size-2.5" />
                        <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                        {activity.company && (
                          <>
                            <span>•</span>
                            <span>{activity.company.name}</span>
                          </>
                        )}
                        {activity.entityType && activity.entityId && (
                          <>
                            <span>•</span>
                            <span className="text-[10px]">{activity.entityType} #{activity.entityId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ol>
      </CardContent>
    </Card>
  );
}

