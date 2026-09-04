"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareJobButton({
  title,
  company,
  url,
}: {
  title: string;
  company: string;
  url: string;
}) {
  const [status, setStatus] = useState("");
  async function share() {
    const data = {
      title: `${title} at ${company}`,
      text: `${title} at ${company}`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setStatus("Link copied");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setStatus("Open the listing to copy its link.");
    }
  }
  return (
    <span className="flex items-center gap-2">
      <span
        role="status"
        className="max-w-28 text-right text-[10px] text-[#bdb6e9]"
      >
        {status}
      </span>
      <button
        type="button"
        onClick={() => void share()}
        aria-label={`Share ${title} at ${company}`}
        className="deck-mini-control"
      >
        {status === "Link copied" ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Share2 className="size-4" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
