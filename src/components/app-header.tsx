"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Compass, Heart, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  icon: LucideIcon;
  label: string;
}> = [
  { href: "/", icon: Compass, label: "Discover" },
  { href: "/saved", icon: Heart, label: "Saved" },
  { href: "/profile", icon: UserRound, label: "You" },
];

function matchesPath(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppDock() {
  const pathname = usePathname();

  if (pathname === "/unlock") return null;

  return (
    <nav
      className="safe-area-dock-offset pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 sm:px-6"
      aria-label="Primary navigation"
    >
      <div className="obsidian-dock pointer-events-auto mx-auto grid w-[min(100%,20.5rem)] grid-cols-3 gap-1 rounded-[1.5rem] p-1 shadow-[0_16px_44px_rgba(0,0,0,.32)]">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = matchesPath(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative grid h-14 min-w-0 place-items-center rounded-[1.15rem] text-white/52 outline-none transition-[color,transform] duration-200 hover:!bg-transparent hover:text-white/82 active:scale-[.97] focus-visible:ring-2 focus-visible:ring-white/45 motion-reduce:transition-none",
                active && "text-white",
              )}
              style={active ? { color: "#ffffff" } : undefined}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "relative grid size-11 shrink-0 place-items-center rounded-[0.95rem] border border-transparent transition-[background-color,border-color,box-shadow,transform] duration-200",
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
