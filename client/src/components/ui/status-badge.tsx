import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BathBookingStatus, QuadBookingStatus, CottageBookingStatus, TaskStatus } from "@shared/schema";

type Status = BathBookingStatus | QuadBookingStatus | CottageBookingStatus | TaskStatus;

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending_call: { label: "Pending Call", className: "bg-status-pending text-black" },
  awaiting_prepayment: { label: "Awaiting Payment", className: "bg-status-awaiting text-white" },
  confirmed: { label: "Confirmed", className: "bg-status-confirmed text-white" },
  completed: { label: "Completed", className: "bg-status-completed text-white" },
  cancelled: { label: "Cancelled", className: "bg-status-cancelled text-white" },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground" },
  planned: { label: "Planned", className: "bg-status-awaiting text-white" },
  checked_in: { label: "Checked In", className: "bg-status-confirmed text-white" },
  no_show: { label: "No Show", className: "bg-status-cancelled text-white" },
  open: { label: "Open", className: "bg-status-pending text-black" },
  done: { label: "Done", className: "bg-status-confirmed text-white" },
  full: { label: "Full", className: "bg-status-cancelled text-white" },
  blocked: { label: "Blocked", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  
  return (
    <Badge className={cn("text-xs font-medium", config.className, className)} data-testid={`status-badge-${status}`}>
      {config.label}
    </Badge>
  );
}
