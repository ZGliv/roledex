"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, ChartSpline, Heart, Layers3, Plus, RadioTower, UserRound } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="safe-area-top sticky top-0 z-40 border-b border-black/[0.055] bg-white/92">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-5 lg:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="JobSwipe home"
          aria-current={isActive("/") ? "page" : undefined}
        >
          <span className="relative grid size-8 place-items-center rounded-[0.7rem] bg-[#15161a] text-white transition-transform group-hover:-rotate-2">
            <Layers3 className="size-4" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-white bg-[#d63a52]" />
          </span>
          <span className="text-[15px] font-bold tracking-[-0.035em] text-[#15161a] max-[430px]:hidden">JobSwipe</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Main navigation">
          <Link
            href="/sources"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "size-9 rounded-full text-[#62666d] md:h-8 md:w-auto md:px-3",
              isActive("/sources") && "bg-[#f1f2f4] text-[#15161a]",
            )}
            aria-label="Job sources"
            aria-current={isActive("/sources") ? "page" : undefined}
          >
            <RadioTower data-icon="inline-start" />
            <span className="hidden md:inline">Sources</span>
          </Link>
          <Link
            href="/drive"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "size-9 rounded-full text-[#62666d] md:h-8 md:w-auto md:px-3",
              isActive("/drive") && "bg-[#f1f2f4] text-[#15161a]",
            )}
            aria-label="Audio driving mode"
            aria-current={isActive("/drive") ? "page" : undefined}
          >
            <AudioLines data-icon="inline-start" />
            <span className="hidden md:inline">Listen</span>
          </Link>
          <Link
            href="/saved"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "size-9 rounded-full text-[#62666d] sm:h-8 sm:w-auto sm:px-3",
              isActive("/saved") && "bg-[#fff0f2] text-[#c63d4a]",
            )}
            aria-label="Saved jobs"
            aria-current={isActive("/saved") ? "page" : undefined}
          >
            <Heart data-icon="inline-start" />
            <span className="hidden sm:inline">Saved</span>
          </Link>
          <Link
            href="/insights"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "size-9 rounded-full text-[#62666d] md:h-8 md:w-auto md:px-3",
              isActive("/insights") && "bg-[#f1f2f4] text-[#15161a]",
            )}
            aria-label="Market insights"
            aria-current={isActive("/insights") ? "page" : undefined}
          >
            <ChartSpline data-icon="inline-start" />
            <span className="hidden md:inline">Insights</span>
          </Link>
          <Link
            href="/profile"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "inline-flex size-9 rounded-full text-[#62666d] lg:h-8 lg:w-auto lg:px-3",
              isActive("/profile") && "bg-[#f1f2f4] text-[#15161a]",
            )}
            aria-label="Profile"
            aria-current={isActive("/profile") ? "page" : undefined}
          >
            <UserRound data-icon="inline-start" />
            <span className="hidden lg:inline">Profile</span>
          </Link>
          <Link
            href="/jobs/new"
            className={cn(
              buttonVariants({ size: "icon-sm" }),
              "ml-0.5 inline-flex size-9 rounded-full bg-[#15161a] text-white shadow-sm sm:ml-1 sm:h-8 sm:w-auto sm:px-3 sm:hover:bg-[#2a2c31]",
            )}
            aria-label="Add a job"
            aria-current={isActive("/jobs/new") ? "page" : undefined}
          >
            <Plus data-icon="inline-start" />
            <span className="hidden sm:inline">Add</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
