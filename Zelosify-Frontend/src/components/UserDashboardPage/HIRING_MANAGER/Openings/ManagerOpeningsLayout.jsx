"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, RefreshCw } from "lucide-react";
import useHiringManager from "@/hooks/HiringManager/useHiringManager";
import ErrorComponent from "@/components/common/ErrorComponent";
import EmptyState from "@/components/common/EmptyState";
import { PageHeader, Pagination, StatusPill, TableSkeletonRows } from "@/components/common/HiringUI";
import { formatDate } from "@/utils/Common/date";

const PAGE_SIZE = 10;
const COLUMNS = ["Title", "Status", "Location", "Contract Type", "Posted", "Experience", "Profiles", "To review"];

/**
 * Hiring Manager → /hiring-manager/openings
 * Only the openings assigned to the logged-in manager (enforced by the API).
 */
export default function ManagerOpeningsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const { openings, pagination, isLoading, error, handleFetchOpenings, handleClearError } = useHiringManager();

  useEffect(() => {
    if (pathname === "/hiring-manager/openings") {
      handleFetchOpenings({ page, limit: PAGE_SIZE });
    }
  }, [pathname, page, handleFetchOpenings]);

  const refresh = useCallback(() => {
    handleClearError();
    handleFetchOpenings({ page, limit: PAGE_SIZE, forceRefresh: true });
  }, [handleClearError, handleFetchOpenings, page]);

  const openDetail = (id) => router.push(`/hiring-manager/openings/${id}`);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <PageHeader
        title="My Openings"
        subtitle="Openings you manage. Review AI-ranked candidate profiles and shortlist the best fits."
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
        <ErrorComponent title="Could not load your openings" message={error} onRetry={refresh} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <caption className="sr-only">Openings you manage</caption>
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
                      className={`cursor-pointer hover:bg-accent focus:bg-accent focus:outline-none ${isLoading ? "opacity-60" : ""}`}
                      aria-label={`Review ${o.title}`}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">{o.title}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{o.location || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{o.contractType || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{formatDate(o.postedDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-secondary">{o.experienceRange}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-foreground">{o.profilesCount}</td>
                      <td className="px-4 py-3">
                        {o.awaitingDecisionCount > 0 ? (
                          <span className="inline-flex min-w-6 justify-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {o.awaitingDecisionCount}
                          </span>
                        ) : (
                          <span className="text-sm text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && openings.length === 0 && (
            <EmptyState
              icon={<ClipboardList className="h-14 w-14" />}
              title="No openings assigned"
              message="Openings assigned to you will appear here."
            />
          )}

          <Pagination pagination={pagination} onPageChange={setPage} disabled={isLoading} />
        </div>
      )}
    </div>
  );
}
