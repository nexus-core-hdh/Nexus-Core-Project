"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { getInitials } from "@/lib/utils";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

type Professional = {
  id: number;
  name: string;
  image?: string;
  email?: string;
};

export function SuccessMetrics() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [totalProfessionals, setTotalProfessionals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    avgClientRating: 0,
    avgQuotes: 0,
    avgEarnings: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        if (!user) return;

        const projects = await projectApi.getProjects({
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined
        });

        // Collect unique professionals (managers and members) from projects
        const professionalMap = new Map<number, Professional>();
        let totalBudget = 0;
        let totalSpent = 0;
        let projectCount = 0;

        projects.forEach((project: any) => {
          // Add manager
          if (project.manager) {
            professionalMap.set(project.manager.id, {
              id: project.manager.id,
              name: project.manager.name,
              image: project.manager.image,
              email: project.manager.email
            });
          }

          // Add members
          if (project.members) {
            project.members.forEach((member: any) => {
              if (member.user) {
                professionalMap.set(member.user.id, {
                  id: member.user.id,
                  name: member.user.name,
                  image: member.user.image,
                  email: member.user.email
                });
              }
            });
          }

          // Calculate stats
          if (project.budget) totalBudget += project.budget;
          if (project.spent) totalSpent += project.spent;
          projectCount++;
        });

        const professionalsList = Array.from(professionalMap.values()).slice(0, 6);
        setProfessionals(professionalsList);
        setTotalProfessionals(professionalMap.size);

        // Calculate average stats (mock calculations for now)
        const avgEarnings = projectCount > 0 ? totalSpent / projectCount : 0;
        setStats({
          avgClientRating: 7.8, // This would come from a ratings system
          avgQuotes: projectCount,
          avgEarnings: avgEarnings
        });
      } catch (error) {
        console.error("Error fetching professionals data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Professionals</CardDescription>
          <CardTitle className="font-display text-2xl lg:text-3xl">-</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Professionals</CardDescription>
        <CardTitle className="font-display text-2xl lg:text-3xl">{totalProfessionals}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-bold">Today's Heroes</p>
        {professionals.length > 0 ? (
          <div className="flex -space-x-4">
            <TooltipProvider>
              {professionals.map((user) => (
                <Tooltip key={user.id}>
                  <TooltipTrigger>
                    <Avatar className="border-card size-12 border-4 hover:z-10">
                      <AvatarImage src={user.image || `/images/avatars/${String((user.id % 10) + 1).padStart(2, "0")}.png`} alt={user.name} />
                      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{user.name}</TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">No professionals found</div>
        )}
        <p className="mt-8 mb-2 text-sm font-bold">Highlights</p>
        <div className="divide-y *:py-3">
          <div className="flex justify-between text-sm">
            <span>Avg. Client Rating</span>
            <span className="flex items-center gap-1">
              <ArrowUpRight className="size-4 text-green-600" />
              {stats.avgClientRating.toFixed(1)} / 10
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total Projects</span>
            <span className="flex items-center gap-1">
              <ArrowUpRight className="size-4 text-green-600" />
              {stats.avgQuotes}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Avg. Project Budget</span>
            <span className="flex items-center gap-1">
              <ArrowUpRight className="size-4 text-green-600" /> ${stats.avgEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
