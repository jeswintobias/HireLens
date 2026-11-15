"use client";
import { useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, CalendarDays, Clock, MapPin, User, Users } from "lucide-react";
import useVendorOpenings from "@/hooks/Vendor/useVendorOpenings";
import useNotifications from "@/hooks/Notifications/useNotifications";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ErrorComponent from "@/components/common/ErrorComponent";
import { DetailSkeleton, InfoItem, PageHeader, StatusPill } from "@/components/common/HiringUI";
import { formatDate } from "@/utils/Common/date";
import { splitDescription } from "@/utils/Hiring/hiringUtils";
import ProfileUploader from "./ProfileUploader";
import VendorProfilesTable from "./VendorProfilesTable";

/**
 * IT Vendor → /vendor/openings/:id
 * Opening details, drag-and-drop multi upload, own profiles with preview
 * (streamed through the backend) and soft delete.
 */
export default function VendorOpeningDetailLayout({ openingId }) {
  const {
    currentOpening: opening,
    isDetailLoading,
    detailError,
    isSubmitting,
    deletingIds,
    handleFetchOpeningDetail,
    handleSubmitProfiles,
    handleDeleteProfile,
    handlePreviewProfile,
    handleClearError,
    handleClearCurrentOpening,
  } = useVendorOpenings();

  useEffect(() => {
    handleFetchOpeningDetail(openingId);
  }, [openingId, handleFetchOpeningDetail]);

  useEffect(() => () => handleClearCurrentOpening(), [handleClearCurrentOpening]);

  // Live: a decision on one of my candidates here → update the status column.
  const { lastReceived } = useNotifications();
  useEffect(() => {
    const decided = lastReceived?.type === "PROFILE_SHORTLISTED" || lastReceived?.type === "PROFILE_REJECTED";
    if (decided && lastReceived.openingId === openingId) {
      handleFetchOpeningDetail(openingId, { forceRefresh: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastReceived?.id]);

  const retry = useCallback(() => {
    handleClearError();
    handleFetchOpeningDetail(openingId, { forceRefresh: true });
  }, [handleClearError, handleFetchOpeningDetail, openingId]);

  const backLink = (
    <Link
      href="/vendor/openings"
      className="mb-2 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All openings
    </Link>
  );

  if (detailError) {
    return (
      <div className="w-full px-4 py-6 sm:px-6">
        {backLink}
        <ErrorComponent title="Could not load this opening" message={detailError} onRetry={retry} />
      </div>
    );
  }

  if (!opening || (isDetailLoading && opening.id !== openingId)) {
    return (
      <div className="w-full px-4 py-6 sm:px-6">
        {backLink}
        <DetailSkeleton />
      </div>
    );
  }

  const { text, skills } = splitDescription(opening.description);
  const accepting = opening.status === "OPEN";

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title={opening.title} subtitle={`Posted ${formatDate(opening.postedDate)}`} actions={<StatusPill status={opening.status} />}>
        {backLink}
      </PageHeader>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoItem label="Hiring manager" value={opening.hiringManagerName} icon={User} />
        <InfoItem label="Experience" value={opening.experienceRange} icon={Clock} />
        <InfoItem label="Location" value={opening.location} icon={MapPin} />
        <InfoItem label="Contract type" value={opening.contractType} icon={Briefcase} />
        <InfoItem label="Expected completion" value={formatDate(opening.expectedCompletionDate)} icon={CalendarDays} />
        <InfoItem label="Your profiles" value={String(opening.profilesCount)} icon={Users} />
      </dl>

      {(text || skills.length > 0) && (
        <section aria-labelledby="desc-heading" className="rounded-lg border border-border p-4 sm:p-5">
          <h2 id="desc-heading" className="mb-2 text-lg font-semibold text-foreground">
            Description
          </h2>
          {text && <p className="whitespace-pre-line text-sm leading-relaxed text-secondary">{text}</p>}
          {skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Required skills">
              {skills.map((s) => (
                <span key={s} className="rounded-full border border-border bg-accent px-2.5 py-0.5 text-xs text-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <ErrorBoundary title="Upload section failed to load">
        <ProfileUploader
          disabled={!accepting}
          disabledReason={`This opening is ${opening.status.replace("_", " ").toLowerCase()} and is not accepting new profiles.`}
          isSubmitting={isSubmitting}
          onSubmit={(files) => handleSubmitProfiles(opening.id, files)}
        />
      </ErrorBoundary>

      <ErrorBoundary title="Profiles failed to load">
        <VendorProfilesTable
          profiles={opening.profiles}
          deletingIds={deletingIds}
          onDelete={handleDeleteProfile}
          onPreview={handlePreviewProfile}
        />
      </ErrorBoundary>
    </div>
  );
}
