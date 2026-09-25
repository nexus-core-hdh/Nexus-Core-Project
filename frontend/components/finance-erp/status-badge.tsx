import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/lib/finance-erp/utils/status";
import { cn } from "@/lib/utils";

/** One consistent status pill for every Finance screen — spec section 18. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={cn("font-normal", className)}>
      {status}
    </Badge>
  );
}
