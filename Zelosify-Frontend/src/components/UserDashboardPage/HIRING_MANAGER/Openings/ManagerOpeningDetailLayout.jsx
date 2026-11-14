"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, CalendarDays, Clock, MapPin, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import useHiringManager from "@/hooks/HiringManager/useHiringManager";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ErrorComponent from "@/components/common/ErrorComponent";
import { DetailSkeleton, InfoItem, PageHeader, StatusPill } from "@/components/common/HiringUI";
import VirtualizedList from "@/components/common/VirtualizedList";
import { formatDate } from "@/utils/Common/date";
import { VIRTUALIZATION_THRESHOLD } from "@/utils/Hiring/hiringUtils";
import ProfileCard, { ProfileCardSkeleton } from "./ProfileCard";

const POLL_INTERVAL_MS = 3000;

const BADGE_FILTERS = [
  { key: "ALL", label: "All", count: (s) => s.total },
  { key: "RECOMMENDED", label: "Recommended", count: (s) => s.recommended, dot: "bg-emerald-500" },
  { key: "BORDERLINE", label: "Borderline", count: (s) => s.borderline, dot: "bg-amber-500" },
  { key: "NOT_RECOMMENDED", label: "Not Recommended", count: (s) => s.notRecommended, dot: "bg-rose-500" },
  { key: "PENDING", label: "Pending AI", count: (s) => s.pending, dot: "bg-gray-400" },
];

const SORTS = {
  score: (a, b) => (b.recommendation.score ?? -1) - (a.recommendation.score ?? -1),
  confidence: (a, b) => (b.recommendation.confidence ?? -1) - (a.recommendation.confidence ?? -1),
  newest: (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt),
};

const profileKey = (p) => p.id;

/** Card fallback so one broken record never takes down the whole list. */
const cardFallback = (profile) => () => (
  <div className="rounded-lg border border-rose-200 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
    Could not display profile {profile.fileName}.
  </div>
);

/**
 * Hiring Manager → /hiring-manager/openings/:id
 * AI-ranked profile cards with shortlist / reject, filters, live status
 * polling while the agent runs, and virtualization for long lists.
 */
export default function ManagerOpeningDetailLayout({ openingId }) {
  const {
    currentOpening: opening,
    profiles,
    summary,
    isProfilesLoading,
    profilesError,
    pendingActionIds,
    handleFetchProfiles,
    handleShortlist,
    handleReject,
    handleRerun,
    handleRefreshRecommendations,
    handlePreviewProfile,
    handleClearError,
    handleClearCurrentOpening,
  } = useHiringManager();

  const [badgeFilter, setBadgeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("score");
  const [query, setQuery] = useState("");
  const [pendingReject, setPendingReject] = useState(null);

  useEffect(() => {
    handleFetchProfiles(openingId);
  }, [openingId, handleFetchProfiles]);

  useEffect(() => () => handleClearCurrentOpening(), [handleClearCurrentOpening]);

  const refresh = useCallback(
    (silent = false) => {
      handleClearError();
      return handleFetchProfiles(openingId, { forceRefresh: true, silent });
    },
    [handleClearError, handleFetchProfiles, openingId]
  );

  // Poll AI status while any profile is still being processed; refresh the
  // counters once everything has finished.
  const processingIds = useMemo(
    () => profiles.filter((p) => p.recommendation.state === "PROCESSING").map((p) => p.id),
    [profiles]
  );
  const processingKey = processingIds.join(",");
  const wasProcessingRef = useRef(false);

  useEffect(() => {
    if (!processingKey) {
      if (wasProcessingRef.current) {
        wasProcessingRef.current = false;
        refresh(true);
      }
      return undefined;
    }
    wasProcessingRef.current = true;
    const ids = processingKey.split(",").map(Number);
    const timer = setInterval(() => handleRefreshRecommendations(ids), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [processingKey, handleRefreshRecommendations, refresh]);

  const visibleProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .filter((p) => {
        const rec = p.recommendation;
        if (badgeFilter === "PENDING" && rec.state === "COMPLETED") return false;
        if (badgeFilter !== "ALL" && badgeFilter !== "PENDING" && rec.badge !== badgeFilter) return false;
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        if (q && !p.fileName.toLowerCase().includes(q) && !p.vendorName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => SORTS[sortBy](a, b) || new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }, [profiles, badgeFilter, statusFilter, sortBy, query]);

  const onShortlist = useCallback(
    async (profile) => {
      try {
        toast.success(await handleShortlist(profile.id));
      } catch (message) {
        toast.error(String(message));
        refresh(true);
      }
    },
    [handleShortlist, refresh]
  );

  const confirmReject = useCallback(async () => {
    const profile = pendingReject;
    setPendingReject(null);
    try {
      toast.success(await handleReject(profile.id));
    } catch (message) {
      toast.error(String(message));
      refresh(true);
    }
  }, [pendingReject, handleReject, refresh]);

  const onRerun = useCallback(
    async (profile) => {
      try {
        await handleRerun(profile.id);
        toast.info(`AI analysis queued for ${profile.fileName}`);
      } catch (message) {
        toast.error(String(message));
      }
    },
    [handleRerun]
  );

  const onPreview = useCallback(
    async (profile) => {
      try {
        await handlePreviewProfile(profile);
      } catch (message) {
        toast.error(String(message));
      }
    },
    [handlePreviewProfile]
  );

  const renderProfile = useCallback(
    (profile) => (
      <ErrorBoundary fallback={cardFallback(profile)} resetKeys={[profile]}>
        <ProfileCard
          profile={profile}
          busy={pendingActionIds.includes(profile.id)}
          onShortlist={onShortlist}
          onReject={setPendingReject}
          onRerun={onRerun}
          onPreview={onPreview}
        />
      </ErrorBoundary>
    ),
    [pendingActionIds, onShortlist, onRerun, onPreview]
  );

  const backLink = (
    <Link
      href="/hiring-manager/openings"
      className="mb-2 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My openings
    </Link>
  );

  if (profilesError && !opening) {
    return (
      <div className="w-full px-4 py-6 sm:px-6">
        {backLink}
        <ErrorComponent title="Could not load this opening" message={profilesError} onRetry={() => refresh()} />
      </div>
    );
  }

  const loadingFirst = !opening || (isProfilesLoading && opening.id !== openingId);

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      {loadingFirst ? (
        <>
          {backLink}
          <DetailSkeleton />
        </>
      ) : (
        <>
          <PageHeader
            title={opening.title}
            subtitle={`Posted ${formatDate(opening.postedDate)}${
              opening.requiredSkills?.length ? ` · Requires ${opening.requiredSkills.join(", ")}` : ""
            }`}
            actions={
              <>
                <StatusPill status={opening.status} />
                <button
                  type="button"
                  onClick={() => refresh(true)}
                  disabled={isProfilesLoading}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isProfilesLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                  Refresh
                </button>
              </>
            }
          >
            {backLink}
          </PageHeader>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <InfoItem label="Experience" value={opening.experienceRange} icon={Clock} />
            <InfoItem label="Location" value={opening.location} icon={MapPin} />
            <InfoItem label="Contract type" value={opening.contractType} icon={Briefcase} />
            <InfoItem label="Expected completion" value={formatDate(opening.expectedCompletionDate)} icon={CalendarDays} />
          </dl>
        </>
      )}

      {/* Filters */}
      {summary && (
        <section aria-label="Filter profiles" className="space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="AI recommendation">
            {BADGE_FILTERS.map((f) => {
              const active = badgeFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBadgeFilter(f.key)}
                  className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:bg-accent"
                  }`}
                >
                  {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} aria-hidden="true" />}
                  {f.label}
                  <span className="text-sm tabular-nums opacity-70">{f.count(summary)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1 sm:max-w-xs">
              <span className="sr-only">Search profiles</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search file or vendor"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-secondary">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="ALL">All ({summary.total})</option>
                <option value="SUBMITTED">To review ({summary.total - summary.shortlisted - summary.rejected})</option>
                <option value="SHORTLISTED">Shortlisted ({summary.shortlisted})</option>
                <option value="REJECTED">Rejected ({summary.rejected})</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-secondary">
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="score">Highest score</option>
                <option value="confidence">Highest confidence</option>
                <option value="newest">Newest upload</option>
              </select>
            </label>
            <p className="text-xs text-secondary sm:ml-auto" aria-live="polite">
              {visibleProfiles.length} shown
              {visibleProfiles.length > VIRTUALIZATION_THRESHOLD ? " · virtualized" : ""}
              {processingIds.length > 0 ? ` · ${processingIds.length} analyzing…` : ""}
            </p>
          </div>
        </section>
      )}

      {/* Profiles */}
      {loadingFirst ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading profiles">
          {Array.from({ length: 3 }).map((_, i) => (
            <ProfileCardSkeleton key={i} />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No profiles yet"
          message="Vendors have not submitted any candidates for this opening."
        />
      ) : visibleProfiles.length === 0 ? (
        <EmptyState title="No matching profiles" message="Try a different filter or search." />
      ) : (
        <ErrorBoundary title="Profiles failed to display">
          <VirtualizedList
            items={visibleProfiles}
            getKey={profileKey}
            renderItem={renderProfile}
            estimateHeight={300}
            ariaLabel="Candidate profiles"
          />
        </ErrorBoundary>
      )}

      <ConfirmDialog
        open={!!pendingReject}
        onOpenChange={(open) => !open && setPendingReject(null)}
        title="Reject this candidate?"
        description={`"${pendingReject?.fileName}" will be marked as rejected. This decision cannot be changed.`}
        confirmLabel="Reject"
        destructive
        onConfirm={confirmReject}
      />
    </div>
  );
}
