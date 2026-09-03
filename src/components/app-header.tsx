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
          "dock-navigation-icon grid size-11 shrink-0 place-items-center rounded-[0.95rem] border border-transparent transition-[background-color,border-color,box-shadow,transform] duration-200",
          active &&
            "border-white/[0.16] bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_8px_22px_rgba(0,0,0,.2),0_0_24px_rgba(129,118,255,.08)]",
        )}
      >
        <Icon
          className="size-[1.4rem]"
          strokeWidth={active ? 2.1 : 1.75}
          aria-hidden="true"
        />
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

export function AppDock() {
  const pathname = usePathname();

  if (pathname === "/unlock" || pathname === "/onboarding") return null;

  return (
    <nav
      className="safe-area-dock-offset pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 sm:px-6"
      aria-label="Primary navigation"
    >
      <div className="obsidian-dock pointer-events-auto mx-auto grid w-[min(100%,26rem)] grid-cols-4 gap-1 rounded-[1.5rem] p-1 shadow-[0_16px_44px_rgba(0,0,0,.32)]">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = matchesPath(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              className={cn(
                "relative grid h-14 min-w-0 place-items-center rounded-[1.15rem] text-white/52 outline-none transition-[color,transform] duration-200 hover:!bg-transparent hover:text-white/82 active:scale-[.97] focus-visible:ring-2 focus-visible:ring-white/45 motion-reduce:transition-none",
                active && "text-white",
              )}
              style={active ? { color: "#ffffff" } : undefined}
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
