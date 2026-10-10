"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendingHref } from "./NavProgress";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS = [
  { href: "/", label: "Today", d: "M4 7h16M4 12h10M4 17h7M18 15l2 2 3-4" },
  { href: "/browse", label: "Browse", d: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z" },
  { href: "/capture", label: "Capture", d: "M12 5v14M5 12h14", plus: true },
  { href: "/ask", label: "Ask", d: "M5 5h14v10H9l-4 4z" },
  { href: "/settings", label: "Settings", d: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" },
];

export function TabBar() {
  const pending = usePendingHref();
  const current = usePathname();
  // While a tapped page loads, highlight the tab you tapped rather than the one you're leaving.
  const path = pending ? pending.split("?")[0] : current;
  const active = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/browse" && path.startsWith("/timeline"));
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`${t.plus ? "plus " : ""}${active(t.href) ? "on" : ""}`} aria-current={active(t.href) ? "page" : undefined}>
            {t.plus ? <span className="circle">{icon(t.d)}</span> : icon(t.d)}
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
