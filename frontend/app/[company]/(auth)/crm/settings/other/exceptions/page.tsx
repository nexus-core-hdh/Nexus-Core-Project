"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth";
import { exceptionLogsApi } from "@/lib/api";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Search, Trash2, Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

interface Exception {
  id: number;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  source: string;
  userId?: number;
  userName?: string;
  companyId?: number;
  branchId?: number;
  timestamp: string;
  resolved: boolean;
  details?: string;
}

export default function ExceptionsPage() {
  const [loading, setLoading] = useState(false);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [resolvedFilter, setResolvedFilter] = useState<string>("all");

  useEffect(() => {
    fetchExceptions();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchExceptions = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("User not found");
        return;
      }

      const data = await exceptionLogsApi.getExceptionLogs({
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      });

      const transformed: Exception[] = (data || []).map((e: any) => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        message: e.message,
        source: e.source,
        userId: e.userId ?? undefined,
        userName: e.user?.name ?? undefined,
        companyId: e.companyId ?? undefined,
        branchId: e.branchId ?? undefined,
        timestamp: e.createdAt,
        resolved: e.resolved,
        details: e.stack || e.notes || undefined
      }));

      setExceptions(transformed);
    } catch (error: any) {
      console.error("Failed to fetch exceptions:", error);
      toast.error("Failed to load exceptions");
    } finally {
      setLoading(false);
    }
  };

  const filteredExceptions = exceptions.filter((exc) => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (
        !exc.message.toLowerCase().includes(s) &&
        !exc.type.toLowerCase().includes(s) &&
        !exc.source.toLowerCase().includes(s)
      ) return false;
    }
    if (severityFilter !== "all" && exc.severity !== severityFilter) return false;
    if (resolvedFilter !== "all") {
      const isResolved = resolvedFilter === "resolved";
      if (exc.resolved !== isResolved) return false;
    }
    return true;
  });

  const handleResolveToggle = async (id: number, resolved: boolean) => {
    try {
      await exceptionLogsApi.updateExceptionLog(id, { resolved });
      setExceptions((prev) => prev.map((e) => (e.id === id ? { ...e, resolved } : e)));
      toast.success(resolved ? "Marked as resolved" : "Marked as unresolved");
    } catch (error: any) {
      console.error("Failed to update exception:", error);
      toast.error("Failed to update exception");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this exception log?")) return;
    try {
      await exceptionLogsApi.deleteExceptionLog(id);
      setExceptions((prev) => prev.filter((e) => e.id !== id));
      toast.success("Exception deleted");
    } catch (error: any) {
      console.error("Failed to delete exception:", error);
      toast.error("Failed to delete exception");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Exceptions</h1>
        <Button
          variant="outline"
          onClick={fetchExceptions}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          <span className="hidden lg:inline">Refresh</span>
        </Button>
      </div>

      <div className="w-full space-y-6">

      {/* Filters */}
      <div className="flex items-center gap-4 py-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exceptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        {mounted ? (
          <>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="unresolved">Unresolved</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <div className="h-9 w-[180px] rounded-md border bg-background" />
            <div className="h-9 w-[180px] rounded-md border bg-background" />
          </>
        )}
      </div>

      {/* Exceptions Table */}
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-muted-foreground">Loading exceptions...</p>
        </div>
      ) : filteredExceptions.length === 0 ? (
        <div className="rounded-md border">
          <div className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">No exceptions found.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExceptions.map((exception) => (
                    <TableRow key={exception.id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${getSeverityColor(exception.severity)} text-white`}
                        >
                          {exception.severity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {exception.type}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {exception.message}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{exception.source}</Badge>
                      </TableCell>
                      <TableCell>
                        {exception.userName || "System"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTimestamp(exception.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={exception.resolved ? "default" : "destructive"}
                          className="cursor-pointer"
                          onClick={() => handleResolveToggle(exception.id, !exception.resolved)}
                        >
                          {exception.resolved ? "Resolved" : "Unresolved"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            onClick={() => handleDelete(exception.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-4">
              <div className="text-muted-foreground flex-1 text-sm">
                {filteredExceptions.length} exception(s) found
              </div>
            </div>
          </>
      )}
      </div>
    </>
  );
}

