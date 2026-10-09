"use client";

import Link from "@/components/app-link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Settings, LayoutDashboard, FolderKanban, Activity, Users } from "lucide-react";
import { CompleteYourProfileCard } from "./complete-your-profile";
import { generateMeta } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CardSkills } from "@/app/[company]/(auth)/pages/profile/card-skills";
import { LatestActivity } from "@/app/[company]/(auth)/pages/profile/latest-activity";
import { AboutMe } from "@/app/[company]/(auth)/pages/profile/about-me";
import { Connections } from "@/app/[company]/(auth)/pages/profile/connections";
import { ProfileCard } from "@/app/[company]/(auth)/pages/profile/profile-card";
import { ProjectsTab } from "@/app/[company]/(auth)/pages/profile/projects-tab";
import { ActivitiesTab } from "@/app/[company]/(auth)/pages/profile/activities-tab";
import { MembersTab } from "@/app/[company]/(auth)/pages/profile/members-tab";

export default function Page() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<string>("overview");

  useEffect(() => {
    if (tabParam && ["overview", "projects", "activities", "members"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Profile Page</h1>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/pages/settings">
              <Settings />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            <span>Projects</span>
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Activities</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Members</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-1">
              <ProfileCard />
              <CompleteYourProfileCard />
              <CardSkills />
            </div>
            <div className="space-y-4 xl:col-span-2">
              <LatestActivity />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <AboutMe />
                <Connections />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <ProjectsTab />
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <ActivitiesTab />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <MembersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
