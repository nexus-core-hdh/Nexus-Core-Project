"use client";

import { useEffect, useState } from "react";
import {
  Check,
  UserPlus,
  Users,
  ChevronRight,
  UsersIcon,
  BadgeDollarSignIcon,
  ContainerIcon,
  PaletteIcon,
  UserCheck
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { userConnectionsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { generateAvatarFallback } from "@/lib/utils";

const teams = [
  { id: "1", icon: UsersIcon, name: "#digitalmarketing", members: 8 },
  { id: "2", icon: BadgeDollarSignIcon, name: "#ethereum", members: 14 },
  { id: "3", icon: ContainerIcon, name: "#conference", members: 3 },
  { id: "4", icon: PaletteIcon, name: "#supportteam", members: 3 }
];

interface Connection {
  id: number;
  userId: number;
  name: string;
  email: string;
  avatar?: string;
  status: "pending" | "connected" | "blocked";
  online: boolean;
  isInitiator?: boolean;
}

export function ConnectionsTeams() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const currentUser = getCurrentUser();
        if (currentUser?.id) {
          // Fetch only connected connections for display
          const data = await userConnectionsApi.getConnections(currentUser.id, "connected");
          setConnections(data || []);
        }
      } catch (error) {
        console.error("Failed to fetch connections:", error);
        setConnections([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-muted-foreground text-center py-4 text-sm">
              Loading connections...
            </div>
          ) : connections.length === 0 ? (
            <div className="text-muted-foreground text-center py-4 text-sm">
              No connections yet
            </div>
          ) : (
            connections.map((connection) => (
              <div key={connection.id} className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="size-10">
                    {connection.avatar ? (
                      <AvatarImage src={connection.avatar} alt={connection.name} />
                    ) : (
                      <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                        {getInitials(connection.name)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {connection.online && (
                    <div className="border-background absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 bg-green-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-medium">{connection.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {connection.status === "connected" ? "Connected" : connection.status}
                  </p>
                </div>

                {connection.status === "connected" ? (
                  <Button
                    size="icon-sm"
                    className="shrink-0 rounded-full bg-blue-500 hover:bg-blue-600">
                    <UserCheck />
                  </Button>
                ) : (
                  <Button size="icon-sm" variant="outline" className="shrink-0 rounded-full">
                    <UserPlus />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>

        <CardFooter className="border-t p-0!">
          <Button variant="link" className="flex w-full justify-between rounded-none lg:px-6!">
            View all connections
            <ChevronRight />
          </Button>
        </CardFooter>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center gap-4">
              <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                {team.icon && <team.icon className="size-5" />}
              </div>

              <div className="flex-1">
                <p className="font-medium">{team.name}</p>
                <p className="text-muted-foreground text-sm">{team.members} members</p>
              </div>
            </div>
          ))}
        </CardContent>
        <CardFooter className="border-t p-0!">
          <Button variant="link" className="flex w-full justify-between rounded-none lg:px-6!">
            View all teams
            <ChevronRight />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
