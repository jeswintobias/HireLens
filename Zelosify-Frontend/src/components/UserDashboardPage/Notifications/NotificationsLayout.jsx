"use client";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CheckCircle2, Inbox, Loader2, RefreshCw, XCircle } from "lucide-react";
import useNotifications from "@/hooks/Notifications/useNotifications";
import ErrorComponent from "@/components/common/ErrorComponent";
import { PageHeader } from "@/components/common/HiringUI";
import { Skeleton } from "@/components/UI/shadcn/skeleton";
import { formatDateTime } from "@/utils/Hiring/hiringUtils";

/**
 * Notifications tab (IT vendors and hiring managers).
 * An inbox the user checks when they want: no pop-ups, an unread badge in
 * the sidebar, click to open the related opening, "mark all as read".
 */

const TYPE_STYLE = {
  PROFILES_SUBMITTED: { icon: Inbox, className: "text-blue-600 dark:text-blue-400" },
  PROFILE_SHORTLISTED: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  PROFILE_REJECTED: { icon: XCircle, className: "text-rose-600 dark:text-rose-400" },
};

/** "just now", "5 min ago", "3 h ago", else the full date. */
const timeAgo = (value) => {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDateTime(value);
};

function NotificationRow({ item, onOpen }) {
  const { icon: Icon, className } = TYPE_STYLE[item.type] ?? { icon: Bell, className: "text-secondary" };
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${
          item.read ? "" : "bg-blue-50/60 dark:bg-blue-950/30"
        }`}
      >
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm text-foreground ${item.read ? "" : "font-semibold"}`}>{item.title}</span>
          <span className="mt-0.5 block text-sm text-secondary">{item.message}</span>
          <span className="mt-1 block text-xs text-secondary">{timeAgo(item.createdAt)}</span>
        </span>
        {!item.read && (
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
        )}
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function NotificationsLayout() {
  const router = useRouter();
  const {
    items,
    unreadOnly,
    unreadCount,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    handleFetchNotifications,
    handleLoadMore,
    handleMarkRead,
    handleMarkAllRead,
    handleClearError,
  } = useNotifications();

  useEffect(() => {
    handleFetchNotifications({ page: 1, unreadOnly: false });
  }, [handleFetchNotifications]);

  const showTab = useCallback(
    (onlyUnread) => handleFetchNotifications({ page: 1, unreadOnly: onlyUnread }),
    [handleFetchNotifications]
  );

  const open = useCallback(
    (item) => {
      if (!item.read) handleMarkRead(item.id);
      if (item.link) router.push(item.link);
    },
    [handleMarkRead, router]
  );

  const tabClass = (active) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-background font-medium text-foreground shadow-sm" : "text-secondary hover:text-foreground"
    }`;

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
        actions={
          <>
            <button
              type="button"
              onClick={() => showTab(unreadOnly)}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
            </button>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all as read
            </button>
          </>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-1 border-b border-border bg-accent px-2 py-2" role="tablist">
          <button type="button" role="tab" aria-selected={!unreadOnly} onClick={() => showTab(false)} className={tabClass(!unreadOnly)}>
            All
          </button>
          <button type="button" role="tab" aria-selected={unreadOnly} onClick={() => showTab(true)} className={tabClass(unreadOnly)}>
            Unread {unreadCount > 0 && <span className="text-sm">({unreadCount})</span>}
          </button>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorComponent
              title="Could not load notifications"
              message={error}
              onRetry={() => {
                handleClearError();
                showTab(unreadOnly);
              }}
            />
          </div>
        ) : isLoading && items.length === 0 ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <Bell className="h-8 w-8 text-secondary" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {unreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="max-w-sm text-sm text-secondary">
              You&apos;ll see updates here, such as new candidate submissions and shortlist or reject decisions.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border" aria-label="Notifications">
              {items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={open} />
              ))}
            </ul>
            {hasMore && (
              <div className="border-t border-border p-3 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm text-foreground hover:bg-accent disabled:opacity-50"
                >
                  {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
