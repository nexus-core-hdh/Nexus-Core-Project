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
import { getCurrentUser } from "@/lib/auth";

export type Lead = {
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

interface LeadsCalendarProps {
  leads?: Lead[];
  loading?: boolean;
  onLeadCreate?: (lead: Lead) => void;
  onLeadUpdate?: (lead: Lead) => void;
  onLeadDelete?: (leadId: string) => void;
}

export function LeadsCalendar({
  leads = [],
  loading = false,
  onLeadCreate,
  onLeadUpdate,
  onLeadDelete
}: LeadsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filters, setFilters] = useState({
    status: "all",
    source: "all",
    priority: "all"
  });
  const [leadTemplateId, setLeadTemplateId] = useState<number | undefined>();

  // Load the Lead template ID on mount
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "LEAD",
          true
        );
        const activeTemplate = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "LEAD" && t.isActive)
          : null;
        if (activeTemplate) {
          setLeadTemplateId(activeTemplate.id);
        }
      } catch (error) {
        console.error("Error loading lead template:", error);
      }
    };
    loadTemplate();
  }, []);

  // Get date field from lead (could be createdAt, dueDate, followUpDate, etc.)
  const getLeadDate = (lead: Lead): Date | null => {
    if (lead.followUpDate) return new Date(lead.followUpDate);
    if (lead.dueDate) return new Date(lead.dueDate);
    if (lead.createdAt) return new Date(lead.createdAt);
    return null;
  };

  // Filter leads based on current filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.status !== "all" && lead.status !== filters.status) return false;
      if (filters.source !== "all" && lead.source !== filters.source) return false;
      if (filters.priority !== "all" && lead.priority !== filters.priority) return false;
      return true;
    });
  }, [leads, filters]);

  // Get leads for a specific date
  const getLeadsForDate = (date: Date): Lead[] => {
    return filteredLeads.filter((lead) => {
      const leadDate = getLeadDate(lead);
      if (!leadDate) return false;
      return isSameDay(leadDate, date);
    });
  };

  // Get unique statuses, sources, and priorities for filters
  const statuses = useMemo(() => {
    const unique = new Set(leads.map((l) => l.status).filter((s): s is string => Boolean(s)));
    return Array.from(unique);
  }, [leads]);

  const sources = useMemo(() => {
    const unique = new Set(leads.map((l) => l.source).filter((s): s is string => Boolean(s)));
    return Array.from(unique);
  }, [leads]);

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

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsLeadDialogOpen(true);
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
            const dayLeads = getLeadsForDate(day);
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
                  {dayLeads.slice(0, 3).map((lead) => (
                    <div
                      key={lead.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeadClick(lead);
                      }}
                      className={cn(
                        "text-xs p-1 rounded truncate cursor-pointer hover:opacity-80",
                        lead.priority === "high" && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                        lead.priority === "medium" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                        lead.priority === "low" && "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:bg-blue-200",
                        !lead.priority && "bg-muted text-muted-foreground"
                      )}
                    >
                      {lead.name || lead.email || "Untitled Lead"}
                    </div>
                  ))}
                  {dayLeads.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayLeads.length - 3} more
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
                const dayLeads = getLeadsForDate(day);
                const hourLeads = dayLeads.filter((lead) => {
                  const leadDate = getLeadDate(lead);
                  if (!leadDate) return false;
                  return leadDate.getHours() === hour;
                });

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="border rounded p-1 min-h-[60px] hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleDateClick(new Date(day.setHours(hour, 0, 0, 0)))}
                  >
                    {hourLeads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeadClick(lead);
                        }}
                        className={cn(
                          "text-xs p-1 rounded mb-1 truncate cursor-pointer",
                          lead.priority === "high" && "bg-red-100 text-red-800",
                          lead.priority === "medium" && "bg-yellow-100 text-yellow-800",
                          lead.priority === "low" && "bg-blue-100 text-blue-800"
                        )}
                      >
                        {lead.name || lead.email}
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
    const dayLeads = getLeadsForDate(currentDate);

    return (
      <div className="space-y-4">
        <div className="text-center border-b pb-2">
          <div className="text-lg font-semibold">
            {format(currentDate, "EEEE, MMMM d, yyyy")}
          </div>
        </div>
        <div className="space-y-1">
          {hours.map((hour) => {
            const hourLeads = dayLeads.filter((lead) => {
              const leadDate = getLeadDate(lead);
              if (!leadDate) return false;
              return leadDate.getHours() === hour;
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
                  {hourLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="mb-2 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeadClick(lead);
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{lead.name || "Untitled Lead"}</div>
                            {lead.email && (
                              <div className="text-sm text-muted-foreground">{lead.email}</div>
                            )}
                            {lead.company && (
                              <div className="text-sm text-muted-foreground">{lead.company}</div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {lead.status && (
                              <Badge variant="outline">{lead.status}</Badge>
                            )}
                            {lead.priority && (
                              <Badge
                                variant={
                                  lead.priority === "high" ? "destructive" :
                                  lead.priority === "medium" ? "default" : "secondary"
                                }
                              >
                                {lead.priority}
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
    const leadsByDate = days.map((day) => ({
      date: day,
      leads: getLeadsForDate(day)
    })).filter((item) => item.leads.length > 0);

    if (leadsByDate.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No leads scheduled</h3>
          <p className="text-muted-foreground">
            There are no leads scheduled for the next 30 days.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {leadsByDate.map(({ date, leads }) => (
          <div key={date.toISOString()} className="border rounded-lg p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className="font-semibold">
                {format(date, "EEEE, MMMM d, yyyy")}
              </div>
              <Badge variant="outline">{leads.length} lead{leads.length !== 1 ? "s" : ""}</Badge>
            </div>
            <div className="space-y-2">
              {leads.map((lead) => (
                <Card
                  key={lead.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleLeadClick(lead)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{lead.name || "Untitled Lead"}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {lead.email && <div>{lead.email}</div>}
                          {lead.phone && <div>{lead.phone}</div>}
                          {lead.company && <div>{lead.company}</div>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {lead.status && (
                          <Badge variant="outline">{lead.status}</Badge>
                        )}
                        {lead.priority && (
                          <Badge
                            variant={
                              lead.priority === "high" ? "destructive" :
                              lead.priority === "medium" ? "default" : "secondary"
                            }
                          >
                            {lead.priority}
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

      {/* Create Lead Dialog */}
      <TemplateViewerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={leadTemplateId}
        entityType="LEAD"
        initialData={selectedDate ? {
          followUpDate: selectedDate.toISOString(),
          dueDate: selectedDate.toISOString()
        } : {}}
        onSubmit={async (data) => {
          try {
            // Save to database using entity data API
            const createdEntity = await entityDataApi.createEntityData({
              entityType: "LEAD",
              templateId: leadTemplateId,
              data: data
            });

            // Create local lead object for UI
            const newLead: Lead = {
              id: createdEntity.id?.toString() || `lead-${Date.now()}`,
              ...data,
              createdAt: createdEntity.createdAt || new Date().toISOString()
            };

            // Call the parent callback if provided
            if (onLeadCreate) {
              await onLeadCreate(newLead);
            }

            setIsCreateDialogOpen(false);
            toast.success("Lead created successfully");
          } catch (error: any) {
            console.error("Error creating lead:", error);
            toast.error(error?.error || "Failed to create lead");
            throw error; // Re-throw to let TemplateViewerDialog handle the error state
          }
        }}
        onCancel={() => setIsCreateDialogOpen(false)}
        submitLabel="Create Lead"
      />

      {/* Edit Lead Dialog */}
      {selectedLead && (
        <TemplateViewerDialog
          open={isLeadDialogOpen}
          onOpenChange={setIsLeadDialogOpen}
          templateId={leadTemplateId}
          entityType="LEAD"
          entityId={
            typeof selectedLead.id === "number"
              ? selectedLead.id
              : typeof selectedLead.id === "string" && !selectedLead.id.startsWith("lead-")
              ? parseInt(selectedLead.id)
              : undefined
          }
          initialData={selectedLead || {}}
          onSubmit={async (data) => {
            try {
              if (selectedLead) {
                // Update in database using entity data API
                const leadEntityId = typeof selectedLead.id === "number" 
                  ? selectedLead.id 
                  : typeof selectedLead.id === "string" && !selectedLead.id.startsWith("lead-")
                  ? parseInt(selectedLead.id)
                  : undefined;

                if (leadEntityId) {
                  await entityDataApi.updateEntityData(leadEntityId, data);
                }

                // Update local lead object for UI
                const updatedLead: Lead = {
                  ...selectedLead,
                  ...data,
                  id: leadEntityId?.toString() || selectedLead.id,
                  updatedAt: new Date().toISOString()
                };

                // Call the parent callback if provided
                if (onLeadUpdate) {
                  await onLeadUpdate(updatedLead);
                }

                setIsLeadDialogOpen(false);
                toast.success("Lead updated successfully");
              }
            } catch (error: any) {
              console.error("Error updating lead:", error);
              toast.error(error?.error || "Failed to update lead");
              throw error; // Re-throw to let TemplateViewerDialog handle the error state
            }
          }}
          onCancel={() => setIsLeadDialogOpen(false)}
          submitLabel="Update Lead"
        />
      )}
    </div>
  );
}

