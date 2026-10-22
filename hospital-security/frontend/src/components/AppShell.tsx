"use client";

import {
  Activity,
  BrainCircuit,
  ClipboardList,
  Cpu,
  GitMerge,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
  Network,
  Settings,
  ShieldPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, post } from "@/lib/api";
import { useLiveAlerts, type LiveMessage, type LiveState } from "@/lib/live";
import type { User } from "@/lib/types";
import { cx, Loading } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/threats", label: "Threat monitoring", icon: Activity },
  { href: "/incidents", label: "Incidents", icon: GitMerge },
  { href: "/email", label: "E-mail security", icon: Mail },
  { href: "/url", label: "URL scanner", icon: Link2 },
  { href: "/network", label: "Network intrusion", icon: Network },
  { href: "/hospital", label: "Hospital monitoring", icon: Cpu },
  { href: "/models", label: "Model performance", icon: BrainCircuit },
  { href: "/audit", label: "Audit logs", icon: ClipboardList, role: "admin" as const },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Ctx {
  user: User;
  live: LiveState;
  subscribe: (fn: (m: LiveMessage) => void) => () => void;
}
const ShellContext = createContext<Ctx | null>(null);

export function useShell(): Ctx {
  const c = useContext(ShellContext);
  if (!c) throw new Error("useShell outside AppShell");
  return c;
}

export function useLive(fn: (m: LiveMessage) => void) {
  const { subscribe } = useShell();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}

function LiveIndicator({ state }: { state: LiveState }) {
  const map = {
    live: { text: "Live", cls: "bg-safe", ring: "bg-safe/30" },
    connecting: { text: "Connecting", cls: "bg-medium", ring: "bg-medium/30" },
    reconnecting: { text: "Reconnecting", cls: "bg-high", ring: "bg-high/30" },
    offline: { text: "Offline", cls: "bg-critical", ring: "bg-critical/30" },
  }[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink-soft"
      title="Real-time alert stream connection">
      <span className="relative flex h-2.5 w-2.5">
        {state === "live" && <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full", map.ring)} />}
        <span className={cx("relative inline-flex h-2.5 w-2.5 rounded-full", map.cls)} />
      </span>
      Alert stream: {map.text}
    </span>
  );
}

function Shell({ user, children }: { user: User; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const subs = useRef(new Set<(m: LiveMessage) => void>());
  const live = useLiveAlerts((m) => subs.current.forEach((fn) => fn(m)));
  const subscribe = useCallback((fn: (m: LiveMessage) => void) => {
    subs.current.add(fn);
    return () => {
      subs.current.delete(fn);
    };
  }, []);

  useEffect(() => setOpen(false), [path]);

  const logout = async () => {
    try {
      await post("/auth/logout");
    } finally {
      router.replace("/login");
    }
  };

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.filter((n) => !n.role || n.role === user.role).map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
              active ? "bg-white/95 text-primary-strong shadow-sm" : "text-white/90 hover:bg-white/10")}>
            <Icon aria-hidden className="h-4.5 w-4.5" /> {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <ShellContext.Provider value={{ user, live, subscribe }}>
      <div className="min-h-screen lg:pl-64">
        <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-primary to-[#12735b] px-4 py-5 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full")}>
          <div className="mb-6 flex items-center justify-between px-2">
            <Link href="/" className="flex items-center gap-2 text-white">
              <span className="rounded-xl bg-white/15 p-1.5"><ShieldPlus aria-hidden className="h-6 w-6" /></span>
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold">CareShield SOC</span>
                <span className="block text-[11px] text-white/75">Hospital security operations</span>
              </span>
            </Link>
            <button className="text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          {nav}
          <div className="mt-auto rounded-xl bg-white/10 p-3 text-xs text-white/85">
            <p className="font-semibold text-white">{user.full_name || user.email}</p>
            <p className="truncate">{user.email}</p>
            <p className="mt-1 inline-block rounded bg-white/15 px-1.5 py-0.5 font-medium capitalize">{user.role}</p>
            <button onClick={logout} className="mt-3 flex items-center gap-2 font-medium text-white hover:underline">
              <LogOut aria-hidden className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <button className="rounded-lg p-1.5 text-ink lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden text-xs text-ink-muted sm:block">
            Detections are for human review. No system is blocked or quarantined automatically.
          </p>
          <LiveIndicator state={live} />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;
    api<User>("/auth/me")
      .then((u) => alive && setUser(u))
      .catch(() => router.replace("/login"));
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener("hs:unauthorized", onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener("hs:unauthorized", onUnauthorized);
    };
  }, [router]);

  if (!user) return <div className="flex min-h-screen items-center justify-center"><Loading label="Checking your session…" /></div>;
  return <Shell user={user}>{children}</Shell>;
}
