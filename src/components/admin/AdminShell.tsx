"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Quote,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client-api";

const NAV = [
  { href: "/admin", label: "Overview", Icon: LayoutDashboard, owner: false },
  { href: "/admin/appointments", label: "Appointments", Icon: ClipboardList, owner: false },
  { href: "/admin/calendar", label: "Calendar", Icon: CalendarDays, owner: false },
  { href: "/admin/doctors", label: "Doctors", Icon: Stethoscope, owner: true },
  { href: "/admin/schedules", label: "Schedules & holidays", Icon: Clock, owner: true },
  { href: "/admin/treatments", label: "Treatments", Icon: Sparkles, owner: true },
  { href: "/admin/testimonials", label: "Testimonials", Icon: Quote, owner: true },
  { href: "/admin/messages", label: "Messages", Icon: MessageSquare, owner: true },
];

export function AdminShell({
  admin,
  logo,
  unreadMessages,
  children,
}: {
  admin: { name: string; role: "OWNER" | "STAFF" };
  logo: ReactNode;
  unreadMessages: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((n) => !n.owner || admin.role === "OWNER");
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  async function signOut() {
    setSigningOut(true);
    await apiFetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }

  const nav = (
    <nav aria-label="Admin" className="flex flex-1 flex-col">
      <ul className="space-y-1">
        {items.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[1rem] font-semibold transition-colors",
                isActive(href) ? "bg-green text-white" : "text-ink hover:bg-green-soft",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {href === "/admin/messages" && unreadMessages > 0 && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs", isActive(href) ? "bg-white text-green" : "bg-saffron text-ink")}>
                  {unreadMessages}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-1 border-t border-line pt-4">
        <p className="px-3 text-sm text-muted">
          Signed in as <strong className="text-ink">{admin.name}</strong>
          <span className="block text-xs">{admin.role === "OWNER" ? "Owner" : "Staff"}</span>
        </p>
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-green hover:bg-green-soft">
          <ExternalLink className="size-4" aria-hidden="true" /> View website
        </a>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-6 border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="px-2">{logo}</div>
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
          {logo}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex size-11 items-center justify-center rounded-full text-green hover:bg-green-soft"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
            <button type="button" className="absolute inset-0 bg-green-deep/40" aria-label="Close menu" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col gap-4 bg-white px-4 py-4 shadow-lift animate-fade-in">
              <div className="flex justify-end">
                <button type="button" onClick={() => setOpen(false)} className="flex size-11 items-center justify-center rounded-full hover:bg-green-soft" aria-label="Close menu">
                  <X className="size-6" aria-hidden="true" />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
