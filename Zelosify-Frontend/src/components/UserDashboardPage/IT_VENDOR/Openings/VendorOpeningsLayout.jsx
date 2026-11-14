"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, RefreshCw } from "lucide-react";
import useVendorOpenings from "@/hooks/Vendor/useVendorOpenings";
import ErrorComponent from "@/components/common/ErrorComponent";
import EmptyState from "@/components/common/EmptyState";
import { PageHeader, Pagination, StatusPill, TableSkeletonRows } from "@/components/common/HiringUI";
import { formatDate } from "@/utils/Common/date";
import { formatExperience } from "@/utils/Hiring/hiringUtils";

const PAGE_SIZE = 10;
const COLUMNS = ["Title", "Location", "Contract Type", "Posted Date", "Hiring Manager", "Experience"];

/**
 * IT Vendor → /vendor/openings
 * Paginated table of open contract openings in the vendor's tenant.
 */
export default function VendorOpeningsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const { openings, pagination, isLoading, error, handleFetchOpenings, handleClearError } =
    useVendorOpenings();

  useEffect(() => {
    if (pathname === "/vendor/openings") {
      handleFetchOpenings({ page, limit: PAGE_SIZE });
    }
  }, [pathname, page, handleFetchOpenings]);

  const refresh = useCallback(() => {
    handleClearError();
    handleFetchOpenings({ page, limit: PAGE_SIZE, forceRefresh: true });
  }, [handleClearError, handleFetchOpenings, page]);

  const openDetail = (id) => router.push(`/vendor/openings/${id}`);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <PageHeader
        title="Contract Openings"
        subtitle="Open positions in your organization. Select an opening to submit candidate profiles."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error ? (
        <ErrorComponent title="Could not load openings" message={error} onRetry={refresh} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <caption className="sr-only">Contract openings</caption>
              <thead className="bg-tableHeader">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-secondary"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && openings.length === 0 ? (
                  <TableSkeletonRows rows={6} columns={COLUMNS.length} />
                ) : (
                  openings.map((o) => (
                    <tr
                      key={o.id}
                      tabIndex={0}
                      onClick={() => openDetail(o.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openDetail(o.id)}
                      className={`cursor-pointer hover:bg-accent focus:bg-accent focus:outline-none ${
                        isLoading ? "opacity-60" : ""
                      }`}
                      aria-label={`Open ${o.title}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{o.title}</span>
                          {o.status !== "OPEN" && <StatusPill status={o.status} />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{o.location || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{o.contractType || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{formatDate(o.postedDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{o.hiringManagerName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-secondary">
                        {formatExperience(o.experienceMin, o.experienceMax)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && openings.length === 0 && (
            <EmptyState
              icon={<Briefcase className="h-14 w-14" />}
              title="No open positions"
              message="There are no contract openings accepting profiles right now."
            />
          )}

          <Pagination pagination={pagination} onPageChange={setPage} disabled={isLoading} />
        </div>
      )}
    </div>
  );
}
