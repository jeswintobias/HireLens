import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { getApiErrorMessage } from "@/utils/Hiring/hiringUtils";

/**
 * Redux slice for the IT Vendor contract openings module.
 *
 * This slice handles:
 * - Paginated openings list         GET    /vendor/openings
 * - Opening detail + own uploads    GET    /vendor/openings/:id
 * - Profile submission (2 steps)    POST   /vendor/openings/:id/profiles/presign
 *                                   POST   /vendor/openings/:id/profiles/upload
 * - Soft delete of own profile      DELETE /vendor/profiles/:profileId
 *
 * Files are never sent to S3 from the browser: the backend issues encrypted
 * upload tokens, receives the files and stores them itself.
 */

// -----------------------------------------------------------------------------
// Async thunks
// -----------------------------------------------------------------------------

/**
 * Fetch one page of openings for the vendor's tenant.
 * @param {{page?: number, limit?: number}} params
 */
export const fetchVendorOpenings = createAsyncThunk(
  "vendorOpenings/fetchVendorOpenings",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("/vendor/openings", { params: { page, limit } });
      return response.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load openings"));
    }
  }
);

/** Fetch opening detail (includes only this vendor's own profiles). */
export const fetchVendorOpeningDetail = createAsyncThunk(
  "vendorOpenings/fetchVendorOpeningDetail",
  async (openingId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get(`/vendor/openings/${openingId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to load opening"));
    }
  }
);

/**
 * Submit profiles: presign (get one upload token per file), then send the
 * files + tokens in a single multipart request. The backend writes all
 * profile rows in one transaction, so a submission is all-or-nothing.
 * @param {{openingId: string, files: File[]}} params
 */
export const submitVendorProfiles = createAsyncThunk(
  "vendorOpenings/submitVendorProfiles",
  async ({ openingId, files }, { rejectWithValue }) => {
    try {
      const presign = await axiosInstance.post(`/vendor/openings/${openingId}/profiles/presign`, {
        filenames: files.map((f) => f.name),
      });
      const tokens = presign.data.data.map((t) => t.uploadToken);

      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.append("uploadTokens", JSON.stringify(tokens));

      const response = await axiosInstance.post(`/vendor/openings/${openingId}/profiles/upload`, form);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to submit profiles"));
    }
  }
);

/** Soft delete one of the vendor's own (not yet reviewed) profiles. */
export const deleteVendorProfile = createAsyncThunk(
  "vendorOpenings/deleteVendorProfile",
  async (profileId, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`/vendor/profiles/${profileId}`);
      return profileId;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, "Failed to delete profile"));
    }
  }
);

/** Fetch a stored resume through the backend (returns a Blob). */
export const fetchVendorProfileFile = async (profileId) => {
  const response = await axiosInstance.get(`/vendor/profiles/${profileId}/preview`, {
    responseType: "blob",
  });
  return response.data;
};

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const initialState = {
  /** Openings on the current page */
  openings: [],
  /** { page, limit, total, totalPages } from the API */
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  isLoading: false,
  error: null,

  /** Currently opened opening (with the vendor's own profiles) */
  currentOpening: null,
  isDetailLoading: false,
  detailError: null,

  /** Profile submission state */
  isSubmitting: false,
  submitError: null,

  /** Ids of profiles currently being deleted */
  deletingIds: [],
};

const vendorOpeningsSlice = createSlice({
  name: "vendorOpenings",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.detailError = null;
      state.submitError = null;
    },
    clearCurrentOpening: (state) => {
      state.currentOpening = null;
      state.detailError = null;
    },
    resetVendorOpenings: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // List
      .addCase(fetchVendorOpenings.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchVendorOpenings.fulfilled, (state, action) => {
        state.isLoading = false;
        state.openings = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchVendorOpenings.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // Detail
      .addCase(fetchVendorOpeningDetail.pending, (state, action) => {
        state.isDetailLoading = true;
        state.detailError = null;
        if (state.currentOpening?.id !== action.meta.arg) state.currentOpening = null;
      })
      .addCase(fetchVendorOpeningDetail.fulfilled, (state, action) => {
        state.isDetailLoading = false;
        state.currentOpening = action.payload;
      })
      .addCase(fetchVendorOpeningDetail.rejected, (state, action) => {
        state.isDetailLoading = false;
        state.detailError = action.payload;
      })

      // Submit
      .addCase(submitVendorProfiles.pending, (state) => {
        state.isSubmitting = true;
        state.submitError = null;
      })
      .addCase(submitVendorProfiles.fulfilled, (state, action) => {
        state.isSubmitting = false;
        if (state.currentOpening) {
          state.currentOpening.profiles = [...action.payload, ...state.currentOpening.profiles];
          state.currentOpening.profilesCount = state.currentOpening.profiles.length;
        }
      })
      .addCase(submitVendorProfiles.rejected, (state, action) => {
        state.isSubmitting = false;
        state.submitError = action.payload;
      })

      // Delete
      .addCase(deleteVendorProfile.pending, (state, action) => {
        state.deletingIds.push(action.meta.arg);
      })
      .addCase(deleteVendorProfile.fulfilled, (state, action) => {
        state.deletingIds = state.deletingIds.filter((id) => id !== action.payload);
        if (state.currentOpening) {
          state.currentOpening.profiles = state.currentOpening.profiles.filter(
            (p) => p.id !== action.payload
          );
          state.currentOpening.profilesCount = state.currentOpening.profiles.length;
        }
      })
      .addCase(deleteVendorProfile.rejected, (state, action) => {
        state.deletingIds = state.deletingIds.filter((id) => id !== action.meta.arg);
      });
  },
});

export const { clearError, clearCurrentOpening, resetVendorOpenings } = vendorOpeningsSlice.actions;

// Selectors
export const selectVendorOpenings = (state) => state.vendorOpenings.openings;
export const selectVendorOpeningsPagination = (state) => state.vendorOpenings.pagination;
export const selectVendorOpeningsLoading = (state) => state.vendorOpenings.isLoading;
export const selectVendorOpeningsError = (state) => state.vendorOpenings.error;
export const selectVendorCurrentOpening = (state) => state.vendorOpenings.currentOpening;
export const selectVendorDetailLoading = (state) => state.vendorOpenings.isDetailLoading;
export const selectVendorDetailError = (state) => state.vendorOpenings.detailError;
export const selectVendorSubmitting = (state) => state.vendorOpenings.isSubmitting;
export const selectVendorSubmitError = (state) => state.vendorOpenings.submitError;
export const selectVendorDeletingIds = (state) => state.vendorOpenings.deletingIds;

export default vendorOpeningsSlice.reducer;
