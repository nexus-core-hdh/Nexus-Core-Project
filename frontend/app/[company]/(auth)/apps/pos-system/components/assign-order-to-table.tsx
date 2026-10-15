"use client";

import React from "react";
import { cn } from "@/lib/utils";

import { Table, TableCategory, useStore } from "@/app/[company]/(auth)/apps/pos-system/store";
import {
  EnumTableStatus,
  EnumTableStatusColor
} from "@/app/[company]/(auth)/apps/pos-system/enums";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type AssignOrderToTable = {
  open: boolean;
  setOpen: (e: boolean) => void;
  tableCategories: TableCategory[];
  tables: Table[];
};

export default function AssignOrderToTable({
  open,
  setOpen,
  tableCategories,
  tables
}: AssignOrderToTable) {
  const { orders, assignOrderToTable, isCreatingOrder } = useStore();
  const [selectedCategory, setSelectedCategory] = React.useState(tables[0]?.id);
  const [isAssigning, setIsAssigning] = React.useState(false);

  const handleAssignTable = async (tableId: string) => {
    try {
      setIsAssigning(true);
      await assignOrderToTable(tableId);
      setOpen(false);
    } catch (error: any) {
      console.error("Error assigning order to table:", error);
      // You can add a toast notification here if needed
    } finally {
      setIsAssigning(false);
    }
  };

  // If no tables, show a message to create order without table
  if (tables.length === 0) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Order</DialogTitle>
            <DialogDescription>
              No restaurant tables configured. The order will be saved to the database and can be viewed in the Orders page.
              <br />
              <span className="text-sm text-muted-foreground mt-2 block">
                You can create the order without assigning it to a physical table.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isAssigning || isCreatingOrder}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                try {
                  setIsAssigning(true);
                  await assignOrderToTable("");
                  setOpen(false);
                } catch (error) {
                    console.error("Error creating order:", error);
                } finally {
                  setIsAssigning(false);
                }
              }}
              disabled={isAssigning || isCreatingOrder}>
              {isAssigning || isCreatingOrder ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Order to Table</DialogTitle>
          <DialogDescription>Please select a table to assign this order</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Tabs defaultValue={selectedCategory} className="w-full">
            <TabsList className="h-auto w-full flex-col lg:h-9 lg:flex-row">
              {tableCategories.map((category) => (
                <TabsTrigger className="w-full lg:w-auto" key={category.id} value={category.id}>
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {tableCategories.map((c) => (
              <TabsContent key={c.id} value={c.id}>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tables
                    .filter((table) => table.category === c.id)
                    .map((table) => {
                      const tableOrder = orders.find((t) => t.tableId === table.id);

                      if (tableOrder) {
                        table.status = "occupied";
                      }

                      return (
                        <Button
                          key={table.id}
                          variant="outline"
                          className="flex h-16 flex-col"
                          disabled={table.status === "occupied" || isAssigning || isCreatingOrder}
                          onClick={() => handleAssignTable(table.id)}>
                          <span>{table.name}</span>
                          <span
                            className={cn(
                              "text-xs capitalize",
                              EnumTableStatusColor[table.status as EnumTableStatus].text
                            )}>
                            {table.status}
                          </span>
                        </Button>
                      );
                    })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            disabled={isAssigning || isCreatingOrder}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
