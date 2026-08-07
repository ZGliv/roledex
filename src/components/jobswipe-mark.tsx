import { cn } from "@/lib/utils";
import { JobSwipeGlyph } from "@/components/jobswipe-glyph";

export function JobSwipeMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] shadow-[0_1px_2px_rgba(11,18,31,.14),0_5px_14px_rgba(11,18,31,.12)] ring-1 ring-inset",
        inverted
          ? "bg-white text-[#0d1422] ring-[#0d1422]/10"
          : "bg-[#0d1422] text-white ring-white/10",
        className,
      )}
    >
      <JobSwipeGlyph
        className="size-full"
        foregroundColor="currentColor"
      />
    </span>
  );
}
