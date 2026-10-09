"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactsTable } from "./contacts-table";

export default function ContactsPage() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const createDialogTriggerRef = React.useRef<(() => void) | null>(null);

  const handleRefresh = React.useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleCreateClick = React.useCallback(() => {
    createDialogTriggerRef.current?.();
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your contacts using the Contact Capture Template
          </p>
        </div>
        <Button onClick={handleCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Contact
        </Button>
      </div>

      <ContactsTable key={refreshKey} onRefresh={handleRefresh} onCreateClickRef={createDialogTriggerRef} />
    </div>
  );
}
