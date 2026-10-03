import type { ReactNode } from "react";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  children,
  action,
  icon,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-dashed border-line bg-white/60 px-6 py-10 text-center", className)}>
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-soft text-green">
        {icon ?? <Leaf className="size-6" aria-hidden="true" />}
      </div>
      <p className="font-serif text-xl font-semibold text-green">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
