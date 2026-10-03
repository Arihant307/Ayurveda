import type { AppointmentStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/constants/appointments";
import { Badge } from "@/components/ui/Badge";

export const STATUS_TONE: Record<AppointmentStatus, "saffron" | "teal" | "green" | "danger"> = {
  PENDING: "saffron",
  CONFIRMED: "teal",
  COMPLETED: "green",
  CANCELLED: "danger",
};

/** Calendar block colours per status. */
export const STATUS_BLOCK: Record<AppointmentStatus, string> = {
  PENDING: "bg-saffron-soft border-saffron text-ink",
  CONFIRMED: "bg-teal-soft border-teal-deep text-green-deep",
  COMPLETED: "bg-green-soft border-green text-green-deep",
  CANCELLED: "bg-danger-soft border-danger/50 text-danger line-through",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
