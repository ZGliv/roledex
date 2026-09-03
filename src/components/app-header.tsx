"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BriefcaseBusiness, Compass, Heart, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  icon: LucideIcon;
  label: string;
}> = [
  { href: "/", icon: Compass, label: "Discover" },
  { href: "/saved", icon: Heart, label: "Saved" },
  { href: "/command-center", icon: BriefcaseBusiness, label: "Apply" },
  { href: "/profile", icon: UserRound, label: "You" },
];

type NavigationTransitionContextValue = {
  begin: (id: string, label: string) => void;
  end: (id: string) => void;
};

const NavigationTransitionContext =
  createContext<NavigationTransitionContextValue | null>(null);

export function NavigationTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pendingLinksRef = useRef(new Map<string, string>());
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  const begin = useCallback((id: string, label: string) => {
    pendingLinksRef.current.set(id, label);
    setPendingLabel(label);
  }, []);

  const end = useCallback((id: string) => {
    pendingLinksRef.current.delete(id);
    const remainingLabels = [...pendingLinksRef.current.values()];
    setPendingLabel(remainingLabels.at(-1) ?? null);
  }, []);
  const transition = useMemo(() => ({ begin, end }), [begin, end]);

  return (
    <NavigationTransitionContext value={transition}>
      {children}
      <div
        className="navigation-pending-overlay"
        data-visible={pendingLabel ? "true" : "false"}
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        <span className="page-loading-spinner" aria-hidden="true" />
        <span className="sr-only">
          {pendingLabel ? `Opening ${pendingLabel}` : ""}
        </span>
      </div>
    </NavigationTransitionContext>
  );
}

function matchesPath(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function DockLinkContent({
  active,
  Icon,
  label,
}: {
  active: boolean;
  Icon: LucideIcon;
  label: string;
}) {
  const { pending } = useLinkStatus();
  const transition = useContext(NavigationTransitionContext);
  const reporterId = `dock-${label.toLowerCase()}`;

  useEffect(() => {
    if (!pending || !transition) return;

    transition.begin(reporterId, label);
    return () => transition.end(reporterId);
  }, [label, pending, reporterId, transition]);

  return (
    <>
      <span
        className={cn(
          "dock-navigation-icon grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-150",
          active && "text-[#7da4ed]",
        )}
      >
        <Icon
          className="size-[1.25rem]"
          strokeWidth={active ? 2.25 : 1.9}
          aria-hidden="true"
        />
      </span>
      <span className="text-[0.66rem] font-semibold leading-none">{label}</span>
    </>
  );
}

export function AppDock() {
  const pathname = usePathname();

  if (pathname === "/unlock" || pathname === "/onboarding") return null;

  return (
    <nav
      className="safe-area-dock-offset pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 sm:px-6"
      aria-label="Primary navigation"
    >
      <div className="obsidian-dock pointer-events-auto mx-auto grid w-[min(100%,30rem)] grid-cols-4 rounded-[1.15rem] border border-[#2b3542] bg-[#151d27] px-1 py-1.5 shadow-[0_14px_36px_rgba(0,0,0,.28)]">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = matchesPath(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              className={cn(
                "relative flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[#7f8a99] outline-none transition-[color,background-color,transform] duration-150 hover:bg-[#1c2632] hover:text-[#d9dee5] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#6f9bea] motion-reduce:transition-none",
                active && "bg-[#1d2835] text-[#7da4ed]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <DockLinkContent active={active} Icon={Icon} label={label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
