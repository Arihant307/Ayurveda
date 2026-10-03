import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const styles = {
  info: { box: "bg-teal-soft text-green-deep border-teal/40", Icon: Info },
  success: { box: "bg-green-soft text-green-deep border-green/30", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning border-saffron/60", Icon: AlertTriangle },
  error: { box: "bg-danger-soft text-danger border-danger/30", Icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof styles;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[0.95rem] animate-fade-in", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
