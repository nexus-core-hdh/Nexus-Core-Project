"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  subMonths,
  subWeeks
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Filter,
  MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import { formTemplatesApi, entityDataApi } from "@/lib/api";

export type Deal = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  source?: string;
  priority?: "low" | "medium" | "high";
  createdAt?: Date | string;
  updatedAt?: Date | string;
  dueDate?: Date | string;
  followUpDate?: Date | string;
  [key: string]: any;
};

type CalendarView = "month" | "week" | "day" | "agenda";

interface DealsCalendarProps {
  deals?: Deal[];
  loading?: boolean;
  onDealCreate?: (deal: Deal) => void;
  onDealUpdate?: (deal: Deal) => void;
  onDealDelete?: (dealId: string) => void;
}

export function DealsCalendar({
  deals = [],
  loading = false,
  onDealCreate,
  onDealUpdate,
  onDealDelete
}: DealsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filters, setFilters] = useState({
    status: "all",
    source: "all",
    priority: "all"
  });
  const [dealTemplateId, setDealTemplateId] = useState<number | undefined>();

  // Load the Deal template ID on mount
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "DEAL",
          true
        );
        const activeTemplate = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "DEAL" && t.isActive)
          : null;
        if (activeTemplate) {
          setDealTemplateId(activeTemplate.id);
        }
      } catch (error) {
        console.error("Error loading deal template:", error);
      }
    };
    loadTemplate();
  }, []);

  // Get date field from deal (could be createdAt, dueDate, followUpDate, etc.)
  const getDealDate = (deal: Deal): Date | null => {
    if (deal.followUpDate) return new Date(deal.followUpDate);
    if (deal.dueDate) return new Date(deal.dueDate);
    if (deal.createdAt) return new Date(deal.createdAt);
    return null;
  };

  // Filter deals based on current filters
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      if (filters.status !== "all" && deal.status !== filters.status) return false;
      if (filters.source !== "all" && deal.source !== filters.source) return false;
      if (filters.priority !== "all" && deal.priority !== filters.priority) return false;
      return true;
    });
  }, [deals, filters]);

  // Get deals for a specific date
  const getDealsForDate = (date: Date): Deal[] => {
    return filteredDeals.filter((deal) => {
      const dealDate = getDealDate(deal);
      if (!dealDate) return false;
      return isSameDay(dealDate, date);
    });
  };

  // Get unique statuses, sources, and priorities for filters
  const statuses = useMemo(() => {
    const unique = new Set(deals.map((d) => d.status).filter((s): s is string => Boolean(s)));
    return Array.from(unique);
  }, [deals]);

  const sources = useMemo(() => {
    const unique = new Set(deals.map((d) => d.source).filter((s): s is string => Boolean(s)));
    return Array.from(unique);
  }, [deals]);

  const handlePrevious = () => {
    if (view === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, -1));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsCreateDialogOpen(true);
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsDealDialogOpen(true);
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => (
            <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayDeals = getDealsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[100px] border rounded-lg p-2 cursor-pointer hover:bg-muted/50 transition-colors",
                  !isCurrentMonth && "opacity-50",
                  isCurrentDay && "bg-primary/5 border-primary"
                )}
                onClick={() => handleDateClick(day)}
              >
                <div className={cn(
                  "text-sm font-medium mb-1",
                  isCurrentDay && "text-primary font-bold"
                )}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayDeals.slice(0, 3).map((deal) => (
                    <div
                      key={deal.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDealClick(deal);
                      }}
                      className={cn(
                        "text-xs p-1 rounded truncate cursor-pointer hover:opacity-80",
                        deal.priority === "high" && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                        deal.priority === "medium" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                        deal.priority === "low" && "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                        !deal.priority && "bg-muted text-muted-foreground"
                      )}
                    >
                      {deal.name || deal.email || "Untitled Deal"}
                    </div>
                  ))}
                  {dayDeals.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayDeals.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-8 gap-1 border-b pb-2">
          <div className="text-sm font-medium text-muted-foreground">Time</div>
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="text-center">
              <div className="text-sm font-medium">
                {format(day, "EEE")}
              </div>
              <div className={cn(
                "text-xs",
                isToday(day) && "text-primary font-bold"
              )}>
                {format(day, "d MMM")}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 gap-1 min-h-[60px]">
              <div className="text-xs text-muted-foreground pt-2">
                {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
              </div>
              {weekDays.map((day) => {
                const dayDeals = getDealsForDate(day);
                const hourDeals = dayDeals.filter((deal) => {
                  const dealDate = getDealDate(deal);
                  if (!dealDate) return false;
                  return dealDate.getHours() === hour;
                });

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="border rounded p-1 min-h-[60px] hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleDateClick(new Date(day.setHours(hour, 0, 0, 0)))}
                  >
                    {hourDeals.map((deal) => (
                      <div
                        key={deal.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDealClick(deal);
                        }}
                        className={cn(
                          "text-xs p-1 rounded mb-1 truncate cursor-pointer",
                          deal.priority === "high" && "bg-red-100 text-red-800",
                          deal.priority === "medium" && "bg-yellow-100 text-yellow-800",
                          deal.priority === "low" && "bg-blue-100 text-blue-800"
                        )}
                      >
                        {deal.name || deal.email}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayDeals = getDealsForDate(currentDate);

    return (
      <div className="space-y-4">
        <div className="text-center border-b pb-2">
          <div className="text-lg font-semibold">
            {format(currentDate, "EEEE, MMMM d, yyyy")}
          </div>
        </div>
        <div className="space-y-1">
          {hours.map((hour) => {
            const hourDeals = dayDeals.filter((deal) => {
              const dealDate = getDealDate(deal);
              if (!dealDate) return false;
              return dealDate.getHours() === hour;
            });

            return (
              <div key={hour} className="grid grid-cols-12 gap-4 min-h-[80px] border-b">
                <div className="col-span-1 text-sm text-muted-foreground pt-2">
                  {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                </div>
                <div
                  className="col-span-11 p-2 hover:bg-muted/50 cursor-pointer rounded"
                  onClick={() => handleDateClick(new Date(currentDate.setHours(hour, 0, 0, 0)))}
                >
                  {hourDeals.map((deal) => (
                    <Card
                      key={deal.id}
                      className="mb-2 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDealClick(deal);
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{deal.name || "Untitled Deal"}</div>
                            {deal.email && (
                              <div className="text-sm text-muted-foreground">{deal.email}</div>
                            )}
                            {deal.company && (
                              <div className="text-sm text-muted-foreground">{deal.company}</div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {deal.status && (
                              <Badge variant="outline">{deal.status}</Badge>
                            )}
                            {deal.priority && (
                              <Badge
                                variant={
                                  deal.priority === "high" ? "destructive" :
                                  deal.priority === "medium" ? "default" : "secondary"
                                }
                              >
                                {deal.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAgendaView = () => {
    const days = Array.from({ length: 30 }, (_, i) => addDays(currentDate, i));
    const dealsByDate = days.map((day) => ({
      date: day,
      deals: getDealsForDate(day)
    })).filter((item) => item.deals.length > 0);

    if (dealsByDate.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No deals scheduled</h3>
          <p className="text-muted-foreground">
            There are no deals scheduled for the next 30 days.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {dealsByDate.map(({ date, deals }) => (
          <div key={date.toISOString()} className="border rounded-lg p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className="font-semibold">
                {format(date, "EEEE, MMMM d, yyyy")}
              </div>
              <Badge variant="outline">{deals.length} deal{deals.length !== 1 ? "s" : ""}</Badge>
            </div>
            <div className="space-y-2">
              {deals.map((deal) => (
                <Card
                  key={deal.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleDealClick(deal)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{deal.name || "Untitled Deal"}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {deal.email && <div>{deal.email}</div>}
                          {deal.phone && <div>{deal.phone}</div>}
                          {deal.company && <div>{deal.company}</div>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {deal.status && (
                          <Badge variant="outline">{deal.status}</Badge>
                        )}
                        {deal.priority && (
                          <Badge
                            variant={
                              deal.priority === "high" ? "destructive" :
                              deal.priority === "medium" ? "default" : "secondary"
                            }
                          >
                            {deal.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            Today
          </Button>
          <div className="text-lg font-semibold">
            {view === "month" && format(currentDate, "MMMM yyyy")}
            {view === "week" && `${format(startOfWeek(currentDate), "MMM d")} - ${format(endOfWeek(currentDate), "MMM d, yyyy")}`}
            {view === "day" && format(currentDate, "MMMM d, yyyy")}
            {view === "agenda" && "Agenda"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Selector */}
          <Select value={view} onValueChange={(v) => setView(v as CalendarView)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="agenda">Agenda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar View */}
      <div className="border rounded-lg p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading calendar...</div>
          </div>
        ) : (
          <>
            {view === "month" && renderMonthView()}
            {view === "week" && renderWeekView()}
            {view === "day" && renderDayView()}
            {view === "agenda" && renderAgendaView()}
          </>
        )}
      </div>

      {/* Create Deal Dialog */}
      <TemplateViewerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={dealTemplateId}
        entityType="DEAL"
        initialData={selectedDate ? {
          followUpDate: selectedDate.toISOString(),
          dueDate: selectedDate.toISOString()
        } : {}}
        onSubmit={async (data) => {
          try {
            // Save to database using entity data API
            const createdEntity = await entityDataApi.createEntityData({
              entityType: "DEAL",
              templateId: dealTemplateId,
              data: data
            });

            // Create local deal object for UI
            const newDeal: Deal = {
              id: createdEntity.id?.toString() || `deal-${Date.now()}`,
              ...data,
              createdAt: createdEntity.createdAt || new Date().toISOString()
            };

            // Call the parent callback if provided
            if (onDealCreate) {
              await onDealCreate(newDeal);
            }

            setIsCreateDialogOpen(false);
            toast.success("Deal created successfully");
          } catch (error: any) {
            console.error("Error creating deal:", error);
            toast.error(error?.error || "Failed to create deal");
            throw error; // Re-throw to let TemplateViewerDialog handle the error state
          }
        }}
        onCancel={() => setIsCreateDialogOpen(false)}
        submitLabel="Create Deal"
      />

      {/* Edit Deal Dialog */}
      {selectedDeal && (
        <TemplateViewerDialog
          open={isDealDialogOpen}
          onOpenChange={setIsDealDialogOpen}
          templateId={dealTemplateId}
          entityType="DEAL"
          entityId={
            typeof selectedDeal.id === "number"
              ? selectedDeal.id
              : typeof selectedDeal.id === "string" && !selectedDeal.id.startsWith("deal-")
              ? parseInt(selectedDeal.id)
              : undefined
          }
          initialData={selectedDeal || {}}
          onSubmit={async (data) => {
            try {
              if (selectedDeal) {
                // Update in database using entity data API
                const dealEntityId = typeof selectedDeal.id === "number" 
                  ? selectedDeal.id 
                  : typeof selectedDeal.id === "string" && !selectedDeal.id.startsWith("deal-")
                  ? parseInt(selectedDeal.id)
                  : undefined;

                if (dealEntityId) {
                  await entityDataApi.updateEntityData(dealEntityId, data);
                }

                // Update local deal object for UI
                const updatedDeal: Deal = {
                  ...selectedDeal,
                  ...data,
                  id: dealEntityId?.toString() || selectedDeal.id,
                  updatedAt: new Date().toISOString()
                };

                // Call the parent callback if provided
                if (onDealUpdate) {
                  await onDealUpdate(updatedDeal);
                }

                setIsDealDialogOpen(false);
                toast.success("Deal updated successfully");
              }
            } catch (error: any) {
              console.error("Error updating deal:", error);
              toast.error(error?.error || "Failed to update deal");
              throw error; // Re-throw to let TemplateViewerDialog handle the error state
            }
          }}
          onCancel={() => setIsDealDialogOpen(false)}
          submitLabel="Update Deal"
        />
      )}
    </div>
  );
}


































































