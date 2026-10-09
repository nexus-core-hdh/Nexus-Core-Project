"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { AddProjectDialog } from "./components/add-project-dialog";
import Link from "@/components/app-link";

export default function Page() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) return;

      // Fetch all projects for the company/branch, not just user's projects
      const projectsData = await projectApi.getProjects({
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
        // Don't pass userId - this will show all company/branch projects
      });

      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleProjectSaved = async () => {
    // Refetch projects after creating a new one
    await fetchProjects();
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "";
    try {
      return format(new Date(date), "MMM dd, yyyy");
    } catch {
      return "";
    }
  };

  const getTimeLeft = (endDate: string | null | undefined, deadline: string | null | undefined) => {
    const targetDate = deadline || endDate;
    if (!targetDate) return "";
    
    try {
      const today = new Date();
      const target = new Date(targetDate);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return "Overdue";
      if (diffDays === 0) return "Due today";
      if (diffDays === 1) return "1 day left";
      if (diffDays < 7) return `${diffDays} days left`;
      if (diffDays < 30) return `${Math.ceil(diffDays / 7)} week${Math.ceil(diffDays / 7) > 1 ? "s" : ""} left`;
      return `${Math.ceil(diffDays / 30)} month${Math.ceil(diffDays / 30) > 1 ? "s" : ""} left`;
    } catch {
      return "";
    }
  };

  const getProgressColor = (progressColor: string | null | undefined, progress: number) => {
    if (progressColor) return progressColor;
    if (progress >= 75) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <>
      <AddProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleProjectSaved}
      />
      <div className="mb-4 flex flex-row items-center justify-between space-y-2">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">List of your ongoing projects</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full text-center py-8">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No projects found. Create your first project to get started.
          </div>
        ) : (
          projects.map((project) => {
            const teamMembers = project.members?.map((member: any) => member.user) || [];
            const progressColor = getProgressColor(project.progressColor, project.progress || 0);
            const badgeColor = project.badgeColor || progressColor;
            const timeLeft = getTimeLeft(project.endDate, project.deadline);
            const displayDate = formatDate(project.startDate || project.createdAt);

            return (
              <Link href="#" key={project.id}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{project.title}</CardTitle>
                    <CardDescription>{project.subtitle || project.description || ""}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {displayDate && (
                      <div className="text-muted-foreground mb-4 text-sm">{displayDate}</div>
                    )}

                    <div className="mb-6">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm opacity-90">Progress</span>
                        <span className="text-sm font-semibold">{project.progress || 0}%</span>
                      </div>
                      <Progress value={project.progress || 0} indicatorColor={progressColor} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2">
                        {teamMembers.slice(0, 4).map((member: any, i: number) => (
                          <Avatar key={i}>
                            <AvatarImage src={member?.image || `/images/avatars/${String(i % 10 + 1).padStart(2, "0")}.png`} alt={member?.name || ""} />
                            <AvatarFallback>{member?.name?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>

                      {timeLeft && (
                        <Badge
                          className={`${badgeColor} border-0 text-white hover:${badgeColor}`}>
                          {timeLeft}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
