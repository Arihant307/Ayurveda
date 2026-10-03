import type { AppointmentStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/constants/appointments";
import { Badge } from "@/components/ui/Badge";

export const STATUS_TONE: Record<AppointmentStatus, "amber" | "navy" | "teal" | "danger"> = {
  PENDING: "amber",
  CONFIRMED: "navy",
  COMPLETED: "teal",
  CANCELLED: "danger",
};

/** Calendar block colours per status. */
export const STATUS_BLOCK: Record<AppointmentStatus, string> = {
  PENDING: "bg-amber-soft border-amber-line text-ink",
  CONFIRMED: "bg-navy-soft border-navy text-navy",
  COMPLETED: "bg-teal-soft border-teal-dark text-teal-dark",
  CANCELLED: "bg-danger-soft border-danger/50 text-danger line-through",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
