"use client";

import { useEffect, useState } from "react";
import { Award, Briefcase, DollarSign, FileClock } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export function SummaryCards() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pending: 0,
    completed: 0,
    cancelled: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;

        const projectStats = await projectApi.getProjectStats({
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined
        });

        setStats(projectStats);
      } catch (error) {
        console.error("Error fetching project stats:", error);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="*:data-[slot=card]:from-primary/10 grid gap-4 *:data-[slot=card]:bg-gradient-to-t md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Total Projects</CardTitle>
          <CardDescription>
            All projects in your organization
          </CardDescription>
          <CardAction>
            <Briefcase className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active Projects</CardTitle>
          <CardDescription>
            Currently in progress
          </CardDescription>
          <CardAction>
            <FileClock className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.active}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending Projects</CardTitle>
          <CardDescription>
            Awaiting start
          </CardDescription>
          <CardAction>
            <Award className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.pending}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Completed Projects</CardTitle>
          <CardDescription>
            Successfully finished
          </CardDescription>
          <CardAction>
            <DollarSign className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.completed}</div>
        </CardContent>
      </Card>
    </div>
  );
}
