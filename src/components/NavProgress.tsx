"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const PendingHref = createContext<string | null>(null);

/** The link you just tapped, while its page is loading. Lets the tab bar highlight it straight away. */
export function usePendingHref() {
  return useContext(PendingHref);
}

/**
 * Shows a progress bar across the top the moment an in-app link is tapped, until the new page arrives.
 * Feedback is instant even on a slow connection, because it doesn't wait for the server.
 */
export function NavProgress({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);

  // A new page has arrived: stop.
  useEffect(() => setPending(null), [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setPending(url.pathname + url.search);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Safety net: never leave the bar running if a navigation is abandoned.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 15000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <PendingHref.Provider value={pending}>
      <div className={`navbar-progress ${pending ? "on" : ""}`} role="progressbar" aria-hidden={!pending} aria-label="Loading" />
      {children}
    </PendingHref.Provider>
  );
}
