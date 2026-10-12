"use client";

import * as React from "react";

import { getCurrentUser } from "@/lib/auth";

export function WelcomeHeader() {
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(getCurrentUser()?.name ?? null);
  }, []);

  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground text-sm">
        Welcome back{name ? `, ${name}` : ""}! 👋
      </p>
    </div>
  );
}
