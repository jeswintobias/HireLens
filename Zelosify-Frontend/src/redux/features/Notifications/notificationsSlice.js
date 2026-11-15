import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { getApiErrorMessage } from "@/utils/Hiring/hiringUtils";

/**
 * Redux slice for in-app notifications (the Notifications tab).
 *
 *   GET  /notifications?page&limit&unread   list (newest first) + unreadCount
 *   GET  /notifications/unread-count        sidebar badge
 *   POST /notifications/:id/read            mark one read
 *   POST /notifications/read-all            mark all read
 *
 * Vendors are told when their candidates are shortlisted or rejected;
 * hiring managers when new profiles are submitted. No pop-ups: users check
 * the tab when they want, guided by the unread badge.
 */

const PAGE_SIZE = 20;

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchNotifications",
  async ({ page = 1, unreadOnly = false } = {}, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("/notifications", {
        params: { page, limit: PAGE_SIZE, ...(unreadOnly ? { unread: "true" } : {}) },
      });
      return { ...response.data, page, unreadOnly };
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load notifications"));
    }
  }
);

export const fetchUnreadCount = createAsyncThunk(
  "notifications/fetchUnreadCount",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("/notifications/unread-count");
      return response.data.unreadCount;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load notification count"));
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  "notifications/markNotificationRead",
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.post(`/notifications/${id}/read`);
      return id;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to update notification"));
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  "notifications/markAllNotificationsRead",
  async (_, { rejectWithValue }) => {
    try {
      await axiosInstance.post("/notifications/read-all");
      return true;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to update notifications"));
    }
  }
);

const initialState = {
  items: [],
  pagination: null,
  unreadOnly: false,
  unreadCount: 0,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  /** Last notification pushed live (pages use it to refresh themselves). */
  lastReceived: null,
};

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    clearNotificationsError: (state) => {
      state.error = null;
    },
    resetNotifications: () => initialState,
    /** A notification pushed over the live stream. */
    notificationReceived: (state, action) => {
      const item = action.payload;
      if (state.items.some((n) => n.id === item.id)) return;
      if (!item.read) state.unreadCount += 1;
      if (state.pagination) state.items = [item, ...state.items];
      state.lastReceived = { ...item, receivedAt: Date.now() };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state, action) => {
        const { page = 1 } = action.meta.arg ?? {};
        if (page > 1) state.isLoadingMore = true;
        else state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        const { data, pagination, unreadCount, page, unreadOnly } = action.payload;
        state.items = page > 1 ? [...state.items, ...data] : data;
        state.pagination = pagination;
        state.unreadOnly = unreadOnly;
        state.unreadCount = unreadCount;
        state.isLoading = false;
        state.isLoadingMore = false;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.isLoadingMore = false;
        state.error = action.payload;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      // Optimistic: mark read immediately, the request confirms it.
      .addCase(markNotificationRead.pending, (state, action) => {
        const item = state.items.find((n) => n.id === action.meta.arg);
        if (item && !item.read) {
          item.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items.forEach((n) => {
          n.read = true;
        });
        if (state.unreadOnly) state.items = [];
        state.unreadCount = 0;
      });
  },
});

export const { clearNotificationsError, resetNotifications, notificationReceived } = notificationsSlice.actions;

export const selectNotifications = (state) => state.notifications.items;
export const selectNotificationsPagination = (state) => state.notifications.pagination;
export const selectNotificationsUnreadOnly = (state) => state.notifications.unreadOnly;
export const selectUnreadNotificationCount = (state) => state.notifications.unreadCount;
export const selectNotificationsLoading = (state) => state.notifications.isLoading;
export const selectNotificationsLoadingMore = (state) => state.notifications.isLoadingMore;
export const selectNotificationsError = (state) => state.notifications.error;
export const selectLastReceivedNotification = (state) => state.notifications.lastReceived;

export default notificationsSlice.reducer;
