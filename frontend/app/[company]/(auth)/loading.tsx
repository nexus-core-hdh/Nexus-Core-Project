import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function TableSkeleton() {
  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="p-4 border-b">
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-3 items-center">
            <Skeleton className="h-4 col-span-4" />
            <Skeleton className="h-4 col-span-3" />
            <Skeleton className="h-4 col-span-2" />
            <Skeleton className="h-4 col-span-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>

      <TableSkeleton />
    </div>
  );
}

