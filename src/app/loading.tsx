import { JobSwipeMark } from "@/components/jobswipe-mark";

export default function Loading() {
  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <JobSwipeMark className="size-11 animate-pulse" />
        <p className="text-xs text-[#7f8998]">
          Finding your next move
        </p>
      </div>
    </div>
  );
}
