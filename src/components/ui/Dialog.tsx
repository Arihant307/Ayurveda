"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Accessible modal built on the native <dialog> element
 * (focus trapping, Escape to close and inert background come for free).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** "drawer" slides in from the right on larger screens and fills the screen on phones. */
  variant?: "modal" | "drawer";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-navy-dark/40 backdrop:backdrop-blur-[2px]",
        variant === "modal" && "fixed inset-0 m-auto h-fit w-[calc(100%-2rem)]",
        variant === "modal" && size === "sm" && "sm:max-w-md",
        variant === "modal" && size === "md" && "sm:max-w-lg",
        variant === "modal" && size === "lg" && "sm:max-w-2xl",
        variant === "drawer" && "fixed inset-y-0 right-0 left-auto h-full w-full sm:max-w-xl",
      )}
    >
      {open && (
        <div
          className={cn(
            "flex flex-col bg-soft text-ink shadow-lift",
            variant === "modal" && "max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] animate-fade-up",
            variant === "drawer" && "h-full animate-fade-in sm:rounded-l-[var(--radius-card)]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="font-serif text-2xl font-semibold text-navy">
                {title}
              </h2>
              {description && <div className="mt-1 text-[0.95rem] text-muted">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-navy-soft hover:text-navy"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-line bg-white/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
