"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { userConnectionsApi } from "@/lib/api";
import { getCurrentUser, getAvatarFallback } from "@/lib/auth";
import { UserCheck } from "lucide-react";

interface Connection {
  id: number;
  userId: number;
  name: string;
  email: string;
  avatar?: string;
  status: "pending" | "connected" | "blocked";
  online?: boolean;
}

export function MembersTab() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) {
          setLoading(false);
          return;
        }

        // Fetch only connected connections (users with whom the logged-in user can chat)
        const data = await userConnectionsApi.getConnections(user.id, "connected");
        setConnections(data || []);
      } catch (error) {
        console.error("Failed to fetch connections:", error);
        setConnections([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">Loading connections...</div>
        </CardContent>
      </Card>
    );
  }

  if (connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8 text-sm">No connections found</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {connections.map((connection) => (
        <Card key={connection.id}>
          <CardContent className="p-4">
            <div className="flex flex-col items-center space-y-3 text-center">
              <div className="relative">
                <Avatar className="h-16 w-16">
                  {connection.avatar ? (
                    <AvatarImage src={connection.avatar} alt={connection.name} />
                  ) : (
                    <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      {getAvatarFallback(connection.name)}
                    </AvatarFallback>
                  )}
                </Avatar>
                {connection.online && (
                  <div className="border-background absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 bg-green-500" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold">{connection.name}</h4>
                <p className="text-muted-foreground text-sm">{connection.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="flex items-center gap-1">
                  <UserCheck className="h-3 w-3" />
                  Connected
                </Badge>
                {connection.online && (
                  <Badge variant="info" className="text-xs">Online</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full">
                Start Chat
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}




























































