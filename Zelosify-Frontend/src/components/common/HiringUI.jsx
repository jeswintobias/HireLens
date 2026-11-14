"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import { statusLabel } from "@/utils/Hiring/hiringUtils";
import { STATUS_STYLES } from "./hiringStyles";

/**
 * Small presentational building blocks shared by the IT Vendor and Hiring
 * Manager contract-hiring screens.
 */

/** Rounded status pill (OPEN, ON_HOLD, SUBMITTED, SHORTLISTED, ...). */
export function StatusPill({ status, className = "" }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] || "bg-accent text-foreground"
      } ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Page title row with optional subtitle and actions. */
export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {children}
        <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Previous / next pagination with a "Showing x–y of z" summary. */
export function Pagination({ pagination, onPageChange, disabled }) {
  const { page, limit, total, totalPages } = pagination || {};
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row"
      aria-label="Pagination"
    >
      <p className="text-sm text-secondary">
        Showing <span className="text-sm text-foreground">{from}</span>–<span className="text-sm text-foreground">{to}</span> of{" "}
        <span className="text-sm text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <span className="text-sm text-secondary">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Next page"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

/** Skeleton rows for a table while data loads. */
export function TableSkeletonRows({ rows = 6, columns = 5 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r} className="border-b border-border" aria-hidden="true">
      {Array.from({ length: columns }).map((__, c) => (
        <td key={c} className="px-4 py-4">
          <Skeleton className={`h-4 ${c === 0 ? "w-48" : "w-24"}`} />
        </td>
      ))}
    </tr>
  ));
}

/** Skeleton for a detail header block. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Label + value cell used in opening detail headers. */
export function InfoItem({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-secondary">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm text-foreground" title={typeof value === "string" ? value : undefined}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
