"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-2xl place-items-center px-6 text-center">
      <div>
        <AlertTriangle className="mx-auto size-10 text-fit-mid" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">JobSwipe needs a moment.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your saved jobs are safe. Try again now, or come back in a few minutes if the service is busy.
        </p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    </div>
  );
}
