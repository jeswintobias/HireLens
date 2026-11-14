import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { getApiErrorMessage } from "@/utils/Hiring/hiringUtils";

/**
 * Redux slice for the Hiring Manager contract openings module.
 *
 * This slice handles:
 * - Own openings (paginated)              GET  /hiring-manager/openings
 * - Profiles + AI result for one opening  GET  /hiring-manager/openings/:id/profiles
 * - Shortlist / reject decisions          POST /hiring-manager/profiles/:id/{shortlist|reject}
 * - AI re-run + status polling            POST /hiring-manager/profiles/:id/recommendation/rerun
 *                                         GET  /hiring-manager/profiles/:id/recommendation
 *
 * The backend only returns openings where hiringManagerId === current user.
 */

/** Page size used when loading every profile of an opening (API max = 50). */
const PROFILE_PAGE_SIZE = 50;
/** Safety cap for a single opening (20 pages × 50). */
const MAX_PROFILE_PAGES = 20;

// -----------------------------------------------------------------------------
// Async thunks
// -----------------------------------------------------------------------------

/** Fetch one page of the manager's own openings. */
export const fetchManagerOpenings = createAsyncThunk(
  "hiringManager/fetchManagerOpenings",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("/hiring-manager/openings", { params: { page, limit } });
      return response.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load openings"));
    }
  }
);

/**
 * Fetch ALL profiles of an opening (page by page) so the UI can sort,
 * filter and virtualize them client-side.
 * @param {{openingId: string, silent?: boolean}} params - silent = background refresh
 */
export const fetchOpeningProfiles = createAsyncThunk(
  "hiringManager/fetchOpeningProfiles",
  async ({ openingId }, { rejectWithValue }) => {
    try {
      let page = 1;
      let first = null;
      const profiles = [];
      do {
        const response = await axiosInstance.get(`/hiring-manager/openings/${openingId}/profiles`, {
          params: { page, limit: PROFILE_PAGE_SIZE },
        });
        first ??= response.data;
        profiles.push(...response.data.data);
        if (page >= response.data.pagination.totalPages) break;
        page++;
      } while (page <= MAX_PROFILE_PAGES);

      return { opening: first.opening, summary: first.summary, profiles };
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load profiles"));
    }
  }
);

/**
 * Shortlist or reject a profile.
 * @param {{profileId: number, action: "shortlist" | "reject"}} params
 */
export const reviewProfile = createAsyncThunk(
  "hiringManager/reviewProfile",
  async ({ profileId, action }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/hiring-manager/profiles/${profileId}/${action}`);
      return { profile: response.data.data, message: response.data.message };
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, `Failed to ${action} profile`));
    }
  }
);

/** Queue a fresh AI recommendation for a profile. */
export const rerunRecommendation = createAsyncThunk(
  "hiringManager/rerunRecommendation",
  async (profileId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/hiring-manager/profiles/${profileId}/recommendation/rerun`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to re-run recommendation"));
    }
  }
);

/** Poll the AI status of profiles that are still being processed. */
export const refreshProfileRecommendations = createAsyncThunk(
  "hiringManager/refreshProfileRecommendations",
  async (profileIds, { rejectWithValue }) => {
    try {
      const results = await Promise.all(
        profileIds.map((id) =>
          axiosInstance.get(`/hiring-manager/profiles/${id}/recommendation`).then((r) => r.data.data)
        )
      );
      return results;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to refresh recommendations"));
    }
  }
);

/** Fetch a stored resume through the backend (returns a Blob). */
export const fetchManagerProfileFile = async (profileId) => {
  const response = await axiosInstance.get(`/hiring-manager/profiles/${profileId}/preview`, {
    responseType: "blob",
  });
  return response.data;
};

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const initialState = {
  /** Own openings on the current page */
  openings: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  isLoading: false,
  error: null,

  /** Opening being reviewed, its profiles and per-badge counts */
  currentOpening: null,
  profiles: [],
  summary: null,
  isProfilesLoading: false,
  profilesError: null,

  /** Ids of profiles with an in-flight shortlist/reject/re-run request */
  pendingActionIds: [],
};

/** Recomputes decision counters after a shortlist/reject. */
const recountDecisions = (state) => {
  if (!state.summary) return;
  state.summary.shortlisted = state.profiles.filter((p) => p.status === "SHORTLISTED").length;
  state.summary.rejected = state.profiles.filter((p) => p.status === "REJECTED").length;
};

const replaceProfile = (state, updated) => {
  const i = state.profiles.findIndex((p) => p.id === updated.id);
  if (i !== -1) state.profiles[i] = { ...state.profiles[i], ...updated };
};

const removePending = (state, id) => {
  state.pendingActionIds = state.pendingActionIds.filter((x) => x !== id);
};

const hiringManagerSlice = createSlice({
  name: "hiringManager",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.profilesError = null;
    },
    clearCurrentOpening: (state) => {
      state.currentOpening = null;
      state.profiles = [];
      state.summary = null;
      state.profilesError = null;
    },
    resetHiringManager: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Openings
      .addCase(fetchManagerOpenings.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchManagerOpenings.fulfilled, (state, action) => {
        state.isLoading = false;
        state.openings = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchManagerOpenings.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // Profiles
      .addCase(fetchOpeningProfiles.pending, (state, action) => {
        const { openingId, silent } = action.meta.arg;
        if (state.currentOpening?.id !== openingId) {
          state.currentOpening = null;
          state.profiles = [];
          state.summary = null;
        }
        if (!silent) state.isProfilesLoading = true;
        state.profilesError = null;
      })
      .addCase(fetchOpeningProfiles.fulfilled, (state, action) => {
        state.isProfilesLoading = false;
        state.currentOpening = action.payload.opening;
        state.profiles = action.payload.profiles;
        state.summary = action.payload.summary;
      })
      .addCase(fetchOpeningProfiles.rejected, (state, action) => {
        state.isProfilesLoading = false;
        state.profilesError = action.payload;
      })

      // Shortlist / reject
      .addCase(reviewProfile.pending, (state, action) => {
        state.pendingActionIds.push(action.meta.arg.profileId);
      })
      .addCase(reviewProfile.fulfilled, (state, action) => {
        removePending(state, action.meta.arg.profileId);
        replaceProfile(state, action.payload.profile);
        recountDecisions(state);
      })
      .addCase(reviewProfile.rejected, (state, action) => {
        removePending(state, action.meta.arg.profileId);
      })

      // Re-run
      .addCase(rerunRecommendation.pending, (state, action) => {
        state.pendingActionIds.push(action.meta.arg);
      })
      .addCase(rerunRecommendation.fulfilled, (state, action) => {
        removePending(state, action.meta.arg);
        const profile = state.profiles.find((p) => p.id === action.meta.arg);
        if (profile) profile.recommendation = { ...profile.recommendation, state: "PROCESSING" };
      })
      .addCase(rerunRecommendation.rejected, (state, action) => {
        removePending(state, action.meta.arg);
      })

      // Polling
      .addCase(refreshProfileRecommendations.fulfilled, (state, action) => {
        action.payload.forEach((p) => replaceProfile(state, p));
      });
  },
});

export const { clearError, clearCurrentOpening, resetHiringManager } = hiringManagerSlice.actions;

// Selectors
export const selectManagerOpenings = (state) => state.hiringManager.openings;
export const selectManagerOpeningsPagination = (state) => state.hiringManager.pagination;
export const selectManagerOpeningsLoading = (state) => state.hiringManager.isLoading;
export const selectManagerOpeningsError = (state) => state.hiringManager.error;
export const selectManagerCurrentOpening = (state) => state.hiringManager.currentOpening;
export const selectManagerProfiles = (state) => state.hiringManager.profiles;
export const selectManagerSummary = (state) => state.hiringManager.summary;
export const selectManagerProfilesLoading = (state) => state.hiringManager.isProfilesLoading;
export const selectManagerProfilesError = (state) => state.hiringManager.profilesError;
export const selectManagerPendingActionIds = (state) => state.hiringManager.pendingActionIds;

export default hiringManagerSlice.reducer;
