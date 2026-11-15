import { useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearNotificationsError,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  selectNotifications,
  selectNotificationsError,
  selectNotificationsLoading,
  selectNotificationsLoadingMore,
  selectNotificationsPagination,
  selectNotificationsUnreadOnly,
  selectUnreadNotificationCount,
  selectLastReceivedNotification,
} from "@/redux/features/Notifications/notificationsSlice";

/**
 * Custom hook for the Notifications tab and the sidebar unread badge.
 * @returns {Object} Hook interface with state and handlers
 */
const useNotifications = () => {
  const dispatch = useDispatch();
  const inflightRef = useRef(false);

  const items = useSelector(selectNotifications);
  const pagination = useSelector(selectNotificationsPagination);
  const unreadOnly = useSelector(selectNotificationsUnreadOnly);
  const unreadCount = useSelector(selectUnreadNotificationCount);
  const isLoading = useSelector(selectNotificationsLoading);
  const isLoadingMore = useSelector(selectNotificationsLoadingMore);
  const error = useSelector(selectNotificationsError);
  /** Last notification pushed live; pages watch it to refresh themselves. */
  const lastReceived = useSelector(selectLastReceivedNotification);

  /** Load a page (page 1 replaces the list, later pages append). */
  const handleFetchNotifications = useCallback(
    async ({ page = 1, unreadOnly: onlyUnread = false } = {}) => {
      if (inflightRef.current) return; // duplicate-request prevention
      inflightRef.current = true;
      try {
        await dispatch(fetchNotifications({ page, unreadOnly: onlyUnread }));
      } finally {
        inflightRef.current = false;
      }
    },
    [dispatch]
  );

  const handleLoadMore = useCallback(() => {
    if (!pagination || pagination.page >= pagination.totalPages) return;
    handleFetchNotifications({ page: pagination.page + 1, unreadOnly });
  }, [handleFetchNotifications, pagination, unreadOnly]);

  const handleRefreshUnreadCount = useCallback(() => dispatch(fetchUnreadCount()), [dispatch]);
  const handleMarkRead = useCallback((id) => dispatch(markNotificationRead(id)), [dispatch]);
  const handleMarkAllRead = useCallback(() => dispatch(markAllNotificationsRead()), [dispatch]);
  const handleClearError = useCallback(() => dispatch(clearNotificationsError()), [dispatch]);

  return {
    items,
    pagination,
    unreadOnly,
    unreadCount,
    isLoading,
    isLoadingMore,
    error,
    lastReceived,
    hasMore: !!pagination && pagination.page < pagination.totalPages,
    handleFetchNotifications,
    handleLoadMore,
    handleRefreshUnreadCount,
    handleMarkRead,
    handleMarkAllRead,
    handleClearError,
  };
};

export default useNotifications;
