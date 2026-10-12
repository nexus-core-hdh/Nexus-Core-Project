"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { projectApi } from "@/lib/api";
import { getCurrentUser, getAvatarFallback } from "@/lib/auth";

interface Project {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  status: string;
  progress: number;
  startDate?: string;
  endDate?: string;
  deadline?: string;
  manager?: {
    id: number;
    name: string;
    image?: string;
  };
  members?: Array<{
    user: {
      id: number;
      name: string;
      image?: string;
    };
  }>;
}

export function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) {
          setLoading(false);
          return;
        }

        const data = await projectApi.getProjects({ userId: user.id });
        setProjects(data || []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: "secondary",
      IN_PROGRESS: "info",
      COMPLETED: "success",
      ON_HOLD: "warning",
      CANCELLED: "destructive"
    };
    return statusMap[status] || "secondary";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">Loading projects...</div>
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">No projects found</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">{project.title}</CardTitle>
                {project.subtitle && (
                  <p className="text-muted-foreground text-sm">{project.subtitle}</p>
                )}
              </div>
              <Badge variant={getStatusColor(project.status) as any}>
                {project.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.description && (
              <p className="text-muted-foreground text-sm">{project.description}</p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <div className="bg-muted h-2 w-full rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {project.manager && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Manager:</span>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={project.manager.image} alt={project.manager.name} />
                    <AvatarFallback>{getAvatarFallback(project.manager.name)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{project.manager.name}</span>
                </div>
              </div>
            )}

            {project.members && project.members.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Members:</span>
                <div className="flex -space-x-2">
                  {project.members.slice(0, 5).map((member, idx) => (
                    <Avatar key={idx} className="h-6 w-6 border-2 border-background">
                      <AvatarImage src={member.user.image} alt={member.user.name} />
                      <AvatarFallback>{getAvatarFallback(member.user.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                  {project.members.length > 5 && (
                    <div className="bg-muted flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-xs">
                      +{project.members.length - 5}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

