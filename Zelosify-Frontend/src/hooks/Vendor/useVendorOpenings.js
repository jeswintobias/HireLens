import { useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearError,
  clearCurrentOpening,
  deleteVendorProfile,
  fetchVendorOpeningDetail,
  fetchVendorOpenings,
  fetchVendorProfileFile,
  resetVendorOpenings,
  selectVendorCurrentOpening,
  selectVendorDeletingIds,
  selectVendorDetailError,
  selectVendorDetailLoading,
  selectVendorOpenings,
  selectVendorOpeningsError,
  selectVendorOpeningsLoading,
  selectVendorOpeningsPagination,
  selectVendorSubmitError,
  selectVendorSubmitting,
  submitVendorProfiles,
} from "@/redux/features/Vendor/vendorOpeningsSlice";
import { getApiErrorMessage, openBlobInNewTab } from "@/utils/Hiring/hiringUtils";

/**
 * Custom hook for the IT Vendor openings module (list, detail, profile
 * submission, soft delete and backend-mediated preview).
 *
 * @returns {Object} Hook interface with state and handlers
 */
const useVendorOpenings = () => {
  const dispatch = useDispatch();
  /** Last request key, used to skip duplicate fetches of the same data */
  const lastListKeyRef = useRef(null);
  const lastDetailIdRef = useRef(null);

  // Selectors
  const openings = useSelector(selectVendorOpenings);
  const pagination = useSelector(selectVendorOpeningsPagination);
  const isLoading = useSelector(selectVendorOpeningsLoading);
  const error = useSelector(selectVendorOpeningsError);
  const currentOpening = useSelector(selectVendorCurrentOpening);
  const isDetailLoading = useSelector(selectVendorDetailLoading);
  const detailError = useSelector(selectVendorDetailError);
  const isSubmitting = useSelector(selectVendorSubmitting);
  const submitError = useSelector(selectVendorSubmitError);
  const deletingIds = useSelector(selectVendorDeletingIds);

  /**
   * Fetch a page of openings (skips an identical repeated request).
   * @param {{page?: number, limit?: number, forceRefresh?: boolean}} params
   */
  const handleFetchOpenings = useCallback(
    async ({ page = 1, limit = 10, forceRefresh = false } = {}) => {
      const key = `${page}:${limit}`;
      if (lastListKeyRef.current === key && !forceRefresh) return;
      lastListKeyRef.current = key;
      try {
        await dispatch(fetchVendorOpenings({ page, limit })).unwrap();
      } catch (err) {
        lastListKeyRef.current = null;
        console.error("Failed to fetch vendor openings:", err);
      }
    },
    [dispatch]
  );

  /** Fetch one opening's detail (skips duplicate requests for the same id). */
  const handleFetchOpeningDetail = useCallback(
    async (openingId, { forceRefresh = false } = {}) => {
      if (!openingId) return;
      if (lastDetailIdRef.current === openingId && !forceRefresh) return;
      lastDetailIdRef.current = openingId;
      try {
        await dispatch(fetchVendorOpeningDetail(openingId)).unwrap();
      } catch (err) {
        lastDetailIdRef.current = null;
        console.error("Failed to fetch opening detail:", err);
      }
    },
    [dispatch]
  );

  /**
   * Submit staged files for an opening. Resolves to the created profiles.
   * Throws the error message so the caller can show it.
   */
  const handleSubmitProfiles = useCallback(
    (openingId, files) => dispatch(submitVendorProfiles({ openingId, files })).unwrap(),
    [dispatch]
  );

  /** Soft delete one of the vendor's own profiles. */
  const handleDeleteProfile = useCallback(
    (profileId) => dispatch(deleteVendorProfile(profileId)).unwrap(),
    [dispatch]
  );

  /** Preview (PDF) or download (PPTX) a resume streamed by the backend. */
  const handlePreviewProfile = useCallback(async (profile) => {
    try {
      const blob = await fetchVendorProfileFile(profile.id);
      openBlobInNewTab(blob, profile.fileName);
    } catch (err) {
      throw getApiErrorMessage(err, "Could not open the file");
    }
  }, []);

  /** Clear error state */
  const handleClearError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  /** Forget the current opening (e.g. when leaving the detail page) */
  const handleClearCurrentOpening = useCallback(() => {
    lastDetailIdRef.current = null;
    dispatch(clearCurrentOpening());
  }, [dispatch]);

  /** Reset module state */
  const handleResetVendorOpenings = useCallback(() => {
    lastListKeyRef.current = null;
    lastDetailIdRef.current = null;
    dispatch(resetVendorOpenings());
  }, [dispatch]);

  return {
    // State
    openings,
    pagination,
    isLoading,
    error,
    currentOpening,
    isDetailLoading,
    detailError,
    isSubmitting,
    submitError,
    deletingIds,

    // Actions
    handleFetchOpenings,
    handleFetchOpeningDetail,
    handleSubmitProfiles,
    handleDeleteProfile,
    handlePreviewProfile,
    handleClearError,
    handleClearCurrentOpening,
    handleResetVendorOpenings,
  };
};

export default useVendorOpenings;
