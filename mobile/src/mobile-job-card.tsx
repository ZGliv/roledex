import { memo, type CSSProperties } from "react";
import { BriefcaseBusiness, MapPin } from "lucide-react";

import type { FeedCard } from "@/features/api-v2/contracts";
import {
  companyInitials,
  companyVisual,
} from "@/features/jobs/components/company-visual";

function workModeLabel(mode: FeedCard["workMode"]) {
  if (mode === "on_site") return "On-site";
  if (mode === "unclear") return "Flexible";
  return `${mode[0]?.toUpperCase()}${mode.slice(1)}`;
}

function employmentLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const MobileJobCard = memo(function MobileJobCard({
  card,
  preview = false,
}: {
  card: FeedCard;
  preview?: boolean;
}) {
  const visual = companyVisual(card.company);
  const style = {
    "--mobile-company-accent": visual.accent,
    "--mobile-company-surface": visual.background,
    "--mobile-company-ink": visual.foreground,
  } as CSSProperties;

  return (
    <article
      aria-hidden={preview || undefined}
      className="mobile-job-card"
      data-preview={preview ? "true" : "false"}
      style={style}
    >
      <header className="mobile-job-card-header">
        <span className="mobile-company-mark">{companyInitials(card.company)}</span>
        <span className="mobile-company-copy">
          <strong>{card.company}</strong>
        </span>
      </header>

      <div className="mobile-job-card-title">
        <h2>{card.title}</h2>
      </div>

      <div className="mobile-job-card-salary">
        <strong>{card.compensation.display}</strong>
      </div>

      <div className="mobile-job-card-meta">
        <span><MapPin aria-hidden="true" />{card.location}</span>
        <span><BriefcaseBusiness aria-hidden="true" />{workModeLabel(card.workMode)} · {employmentLabel(card.employmentType)}</span>
      </div>
    </article>
  );
});
