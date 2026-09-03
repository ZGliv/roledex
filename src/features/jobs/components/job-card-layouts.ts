export const JOB_CARD_LAYOUTS = [
  "gallery-center",
  "signal-left",
  "signal-right",
  "ledger-rail",
  "prism-offset",
  "capsule-stack",
  "horizon-wide",
  "glass-monolith",
  "orbit-medallion",
  "corner-cut",
  "floating-ticket",
  "editorial-left",
  "editorial-right",
  "glass-arch",
  "technical-grid",
  "split-pane",
  "soft-square",
  "halo-frame",
] as const;

export type JobCardLayout = (typeof JOB_CARD_LAYOUTS)[number];

export const JOB_CARD_LAYOUT_COUNT = JOB_CARD_LAYOUTS.length;

function stableLayoutHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function jobCardLayoutForJob(input: {
  company: string;
  id: string;
  title: string;
}): JobCardLayout {
  const identity = [input.company, input.title, input.id]
    .map((value) => value.trim().normalize("NFKC").toLocaleLowerCase("en-US"))
    .join("\0");
  return JOB_CARD_LAYOUTS[stableLayoutHash(identity) % JOB_CARD_LAYOUTS.length];
}
