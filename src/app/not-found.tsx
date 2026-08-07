import Link from "next/link";
import { SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-2xl place-items-center px-6 text-center">
      <div>
        <SearchX className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">That opportunity is not in the deck.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">It may have been removed, archived, or opened from an old link.</p>
        <Link href="/" className={cn(buttonVariants(), "mt-6")}>Return to the deck</Link>
      </div>
    </div>
  );
}
