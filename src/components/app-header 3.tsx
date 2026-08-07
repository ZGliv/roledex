"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  ChartNoAxesColumnIncreasing,
  Heart,
  ListFilter,
  Menu as MenuIcon,
  SlidersHorizontal,
} from "lucide-react";

import { JobSwipeMark } from "@/components/jobswipe-mark";
import { cn } from "@/lib/utils";

function matchesPath(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function HeaderMenuLink({
  active,
  description,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Menu.LinkItem
      closeOnClick
      render={<Link href={href} />}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group grid cursor-default grid-cols-[2.2rem_1fr] items-center gap-2.5 rounded-[0.9rem] px-2 py-2 outline-none transition-colors data-[highlighted]:bg-white/70",
        active && "bg-white/58",
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-[0.7rem] text-[#7a8496] transition-colors group-data-[highlighted]:text-[#202a3d]",
          active && "bg-[#eeecff] text-[#5b52dc]",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold tracking-[-0.015em] text-[#20293a]">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] text-[#858e9e]">
          {description}
        </span>
      </span>
    </Menu.LinkItem>
  );
}

function HeaderToolLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Menu.LinkItem
      closeOnClick
      render={<Link href={href} />}
      className="flex min-h-10 cursor-default items-center justify-center gap-1.5 rounded-[0.8rem] text-[10px] font-semibold text-[#737d90] outline-none transition-colors data-[highlighted]:bg-white/65 data-[highlighted]:text-[#303a4c]"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Menu.LinkItem>
  );
}

export function AppHeader() {
  const pathname = usePathname();

  if (pathname === "/unlock") return null;

  return (
    <header className="safe-area-top sticky top-0 z-40 px-2 pt-1 sm:px-5">
      <div className="glass-bar mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-[1.25rem] px-2.5 sm:px-3.5">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          aria-label="JobSwipe job feed"
          aria-current={matchesPath(pathname, "/") ? "page" : undefined}
        >
          <JobSwipeMark className="transition-transform duration-300 ease-out group-hover:-rotate-3 group-hover:scale-[1.03]" />
          <span className="text-[15px] font-semibold tracking-[-0.045em] text-[#151c2a]">
            JobSwipe
          </span>
        </Link>

        <nav className="flex items-center gap-1.5" aria-label="Main navigation">
          <Link
            href="/saved"
            className={cn(
              "glass-control inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-[#5f6d82] transition-colors hover:bg-white/66 hover:text-[#252e40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              matchesPath(pathname, "/saved") &&
                "bg-white/72 text-[#5750d3] ring-1 ring-[#6557f6]/10",
            )}
            aria-current={matchesPath(pathname, "/saved") ? "page" : undefined}
          >
            <Heart className="size-3.5" aria-hidden="true" />
            Saved
          </Link>

          <Menu.Root>
            <Menu.Trigger
              aria-label="Open navigation menu"
              className="glass-control grid size-11 place-items-center rounded-full text-[#596579] outline-none transition-colors hover:bg-white/70 hover:text-[#20293a] focus-visible:ring-2 focus-visible:ring-primary/30 data-[popup-open]:bg-white/76"
            >
              <MenuIcon className="size-3.5" aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner
                side="bottom"
                align="end"
                sideOffset={8}
                className="z-[70] outline-none"
              >
                <Menu.Popup className="glass-panel-strong w-[min(17.5rem,calc(100vw-1.5rem))] origin-top-right rounded-[1.2rem] p-2 text-[#111827] shadow-[0_28px_80px_rgba(18,28,46,.16)] outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-[.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[.98] data-[starting-style]:opacity-0 motion-reduce:transition-none">
                  <HeaderMenuLink
                    active={matchesPath(pathname, "/")}
                    description="Your next opportunity"
                    href="/"
                    icon={ListFilter}
                    label="Discover"
                  />
                  <HeaderMenuLink
                    active={matchesPath(pathname, "/saved")}
                    description="Shortlist and applications"
                    href="/saved"
                    icon={Heart}
                    label="Saved"
                  />
                  <HeaderMenuLink
                    active={matchesPath(pathname, "/profile")}
                    description="Teach JobSwipe what fits"
                    href="/profile"
                    icon={SlidersHorizontal}
                    label="Your context"
                  />
                  <div className="mx-2 my-1 h-px bg-[#243148]/[0.07]" />
                  <div className="grid grid-cols-2 gap-1 px-1 pt-1">
                    <HeaderToolLink
                      href="/insights"
                      icon={ChartNoAxesColumnIncreasing}
                      label="Insights"
                    />
                    <HeaderToolLink
                      href="/drive"
                      icon={AudioLines}
                      label="Listen"
                    />
                  </div>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </nav>
      </div>
    </header>
  );
}
