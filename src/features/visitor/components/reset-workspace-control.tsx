"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resetGuestWorkspaceAction } from "@/features/visitor/actions";

export function ResetWorkspaceControl() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetWorkspace() {
    setMessage(null);
    startTransition(async () => {
      const result = await resetGuestWorkspaceAction();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setConfirming(true)}
        className="mt-4 w-full text-[#5f6879]"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Reset this workspace
      </Button>
    );
  }

  return (
    <div className="mt-4 border-t border-[#c95d6c]/20 pt-4">
      <p className="text-xs leading-5 text-[#73505a]">
        This permanently deletes this browser&apos;s profile, saves, passes, notes,
        and detailed reviews.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={resetWorkspace}
          disabled={pending}
          className="bg-[#a54051] text-white hover:bg-[#8f3444]"
        >
          {pending ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3.5" aria-hidden="true" />
          )}
          Delete my data
        </Button>
      </div>
      {message ? (
        <p className="mt-2 text-[11px] leading-4 text-[#9b3445]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
