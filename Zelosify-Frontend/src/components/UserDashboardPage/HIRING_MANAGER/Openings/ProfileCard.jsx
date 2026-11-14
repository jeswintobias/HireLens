"use client";
import { memo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  Loader2,
  Presentation,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import { StatusPill } from "@/components/common/HiringUI";
import { BADGE_STYLES } from "@/components/common/hiringStyles";
import {
  formatDateTime,
  formatLatency,
  formatPercent,
} from "@/utils/Hiring/hiringUtils";

/** Recommended / Borderline / Not Recommended pill. */
export function RecommendationBadge({ badge, className = "" }) {
  const style = BADGE_STYLES[badge];
  if (!style) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.className} ${className}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {style.label}
    </span>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-secondary">
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function BreakdownBar({ label, value, weight }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-xs text-secondary">
          {label} <span className="text-xs opacity-70">({weight})</span>
        </span>
        <span className="text-xs tabular-nums text-foreground">{pct}%</span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-label={`${label} match`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkillChips({ title, skills, tone }) {
  if (!skills?.length) return null;
  const toneClass =
    tone === "good"
      ? "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
      : "border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-secondary">{title}:</span>
      {skills.map((s) => (
        <span key={s} className={`rounded-full border px-2 py-0.5 text-xs ${toneClass}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

/** AI section body for each recommendation state. */
function RecommendationBody({ rec, onRerun, busy }) {
  if (rec.state === "PROCESSING") {
    return (
      <div className="space-y-2" aria-live="polite" aria-busy="true">
        <p className="flex items-center gap-2 text-sm text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> AI agent is analyzing this resume…
        </p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (rec.state === "FAILED" || rec.state === "PENDING") {
    const failed = rec.state === "FAILED";
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent px-3 py-2">
        <p className="flex items-center gap-2 text-sm text-secondary">
          {failed ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
          ) : (
            <Clock className="h-4 w-4" aria-hidden="true" />
          )}
          {failed ? "The AI recommendation failed for this profile." : "Waiting for AI analysis."}
        </p>
        <button
          type="button"
          onClick={onRerun}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> {failed ? "Retry" : "Run now"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rec.injectionSuspected && (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          This resume contains text that tries to manipulate the AI. It was ignored and confidence was lowered — review manually.
        </p>
      )}
      {rec.explanation && (
        <p className="text-sm leading-relaxed text-foreground">
          {/* The injection warning is shown as its own banner above. */}
          {rec.explanation.replace(/^⚠️[^.]*\.\s*/, "")}
        </p>
      )}
      {rec.breakdown && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BreakdownBar label="Skills" weight="50%" value={rec.breakdown.skillMatchScore} />
          <BreakdownBar label="Experience" weight="30%" value={rec.breakdown.experienceMatchScore} />
          <BreakdownBar label="Location" weight="20%" value={rec.breakdown.locationMatchScore} />
        </div>
      )}
      <div className="space-y-1.5">
        <SkillChips title="Matched" skills={rec.matchedSkills} tone="good" />
        <SkillChips title="Missing" skills={rec.missingSkills} tone="bad" />
      </div>
    </div>
  );
}

/**
 * One candidate profile with its AI recommendation and the manager's
 * shortlist / reject actions. Decisions are final once made.
 */
function ProfileCard({ profile, busy, onShortlist, onReject, onRerun, onPreview }) {
  const [previewing, setPreviewing] = useState(false);
  const rec = profile.recommendation;
  const done = rec.state === "COMPLETED";
  const decided = profile.status !== "SUBMITTED";
  const FileIcon = profile.fileType === "pdf" ? FileText : Presentation;
  const accent = done && rec.badge ? BADGE_STYLES[rec.badge].bar : "bg-border";

  const preview = async () => {
    setPreviewing(true);
    try {
      await onPreview(profile);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <article
      className="relative overflow-hidden rounded-lg border border-border bg-background shadow-sm"
      aria-label={`Profile ${profile.fileName}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden="true" />
      <div className="space-y-4 p-4 pl-5">
        {/* Header: file + upload info + status */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={preview}
              disabled={previewing}
              className="flex max-w-full items-center gap-2 text-left text-base font-semibold text-foreground hover:underline disabled:opacity-60"
              title={profile.fileType === "pdf" ? "Preview resume" : "Download resume"}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              )}
              <span className="truncate">{profile.fileName}</span>
            </button>
            <p className="mt-0.5 text-xs text-secondary">
              Uploaded {formatDateTime(profile.uploadedAt)} · by {profile.vendorName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {done && <RecommendationBadge badge={rec.badge} />}
            <StatusPill status={profile.status} />
          </div>
        </div>

        {/* Metrics */}
        {done && (
          <div className="grid grid-cols-3 gap-3 rounded-md bg-accent px-3 py-2">
            <Metric label="Score" value={formatPercent(rec.scorePercent)} />
            <Metric label="Confidence" value={formatPercent(rec.confidencePercent)} />
            <Metric label="Processing" value={formatLatency(rec.latencyMs)} icon={Clock} />
          </div>
        )}

        <RecommendationBody rec={rec} onRerun={() => onRerun(profile)} busy={busy} />

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-secondary">
            {decided && profile.decision
              ? `${profile.status === "SHORTLISTED" ? "Shortlisted" : "Rejected"} by ${profile.decision.by} · ${formatDateTime(profile.decision.at)}`
              : done
                ? `Model version ${rec.version}`
                : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onReject(profile)}
              disabled={busy || decided}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-300 px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Reject
            </button>
            <button
              type="button"
              onClick={() => onShortlist(profile)}
              disabled={busy || decided}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Shortlist
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Skeleton placeholder with the same shape as a profile card. */
export function ProfileCardSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4" aria-hidden="true">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export default memo(ProfileCard);
