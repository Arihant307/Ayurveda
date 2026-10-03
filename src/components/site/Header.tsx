"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, Menu, Phone, X } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { cn } from "@/lib/cn";
import { LinkButton, AnchorButton } from "@/components/ui/Button";
import { NAV_LINKS } from "./nav";

export function Header({ logo }: { logo: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-cream transition-[box-shadow,border-color] duration-300",
        scrolled ? "border-b border-line shadow-soft" : "border-b border-transparent",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-green focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="container-site flex h-[4.5rem] items-center justify-between gap-4 md:h-20">
        {logo}

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[0.975rem] font-semibold transition-colors",
                    isActive(link.href) ? "text-green" : "text-ink/80 hover:text-green",
                  )}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-teal" aria-hidden="true" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={CLINIC.phoneHref}
            className="hidden items-center gap-2 rounded-full px-3 py-2 text-[0.95rem] font-semibold text-green hover:bg-green-soft xl:inline-flex"
          >
            <Phone className="size-4" aria-hidden="true" />
            {CLINIC.phoneDisplay}
          </a>
          <div className="hidden sm:block">
            <LinkButton href="/book" size="md" icon={<CalendarCheck className="size-4" aria-hidden="true" />}>
              Book Appointment
            </LinkButton>
          </div>
          <button
            ref={menuButton}
            type="button"
            className="flex size-11 items-center justify-center rounded-full text-green hover:bg-green-soft lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={panel}
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[4.5rem] z-40 overflow-y-auto bg-cream md:top-20 lg:hidden"
      >
        <nav aria-label="Mobile" className="container-site flex min-h-full flex-col py-6 animate-fade-in">
          <ul className="divide-y divide-line border-y border-line">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center justify-between font-serif text-2xl font-semibold",
                    isActive(link.href) ? "text-green" : "text-ink",
                  )}
                >
                  {link.label}
                  {isActive(link.href) && <span className="size-2 rounded-full bg-teal" aria-hidden="true" />}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-3">
            <LinkButton href="/book" size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
              Book Appointment
            </LinkButton>
            <AnchorButton href={CLINIC.phoneHref} variant="outline" size="lg" icon={<Phone className="size-5" aria-hidden="true" />}>
              Call {CLINIC.phoneDisplay}
            </AnchorButton>
          </div>
        </nav>
      </div>
    </header>
  );
}
