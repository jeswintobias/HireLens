import { useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCurrentOpening,
  clearError,
  fetchManagerOpenings,
  fetchManagerProfileFile,
  fetchOpeningProfiles,
  refreshProfileRecommendations,
  rerunRecommendation,
  resetHiringManager,
  reviewProfile,
  selectManagerCurrentOpening,
  selectManagerOpenings,
  selectManagerOpeningsError,
  selectManagerOpeningsLoading,
  selectManagerOpeningsPagination,
  selectManagerPendingActionIds,
  selectManagerProfiles,
  selectManagerProfilesError,
  selectManagerProfilesLoading,
  selectManagerSummary,
} from "@/redux/features/HiringManager/hiringManagerSlice";
import { getApiErrorMessage, openBlobInNewTab } from "@/utils/Hiring/hiringUtils";

/**
 * Custom hook for the Hiring Manager module: own openings, profiles with AI
 * recommendations, shortlist/reject, AI re-run and status polling.
 *
 * @returns {Object} Hook interface with state and handlers
 */
const useHiringManager = () => {
  const dispatch = useDispatch();
  const lastListKeyRef = useRef(null);
  const lastProfilesIdRef = useRef(null);

  // Selectors
  const openings = useSelector(selectManagerOpenings);
  const pagination = useSelector(selectManagerOpeningsPagination);
  const isLoading = useSelector(selectManagerOpeningsLoading);
  const error = useSelector(selectManagerOpeningsError);
  const currentOpening = useSelector(selectManagerCurrentOpening);
  const profiles = useSelector(selectManagerProfiles);
  const summary = useSelector(selectManagerSummary);
  const isProfilesLoading = useSelector(selectManagerProfilesLoading);
  const profilesError = useSelector(selectManagerProfilesError);
  const pendingActionIds = useSelector(selectManagerPendingActionIds);

  /** Fetch a page of own openings (skips identical repeated requests). */
  const handleFetchOpenings = useCallback(
    async ({ page = 1, limit = 10, forceRefresh = false } = {}) => {
      const key = `${page}:${limit}`;
      if (lastListKeyRef.current === key && !forceRefresh) return;
      lastListKeyRef.current = key;
      try {
        await dispatch(fetchManagerOpenings({ page, limit })).unwrap();
      } catch (err) {
        lastListKeyRef.current = null;
        console.error("Failed to fetch manager openings:", err);
      }
    },
    [dispatch]
  );

  /**
   * Fetch all profiles of an opening.
   * @param {string} openingId
   * @param {{forceRefresh?: boolean, silent?: boolean}} options - silent keeps the current list visible
   */
  const handleFetchProfiles = useCallback(
    async (openingId, { forceRefresh = false, silent = false } = {}) => {
      if (!openingId) return;
      if (lastProfilesIdRef.current === openingId && !forceRefresh) return;
      lastProfilesIdRef.current = openingId;
      try {
        await dispatch(fetchOpeningProfiles({ openingId, silent })).unwrap();
      } catch (err) {
        lastProfilesIdRef.current = null;
        console.error("Failed to fetch profiles:", err);
      }
    },
    [dispatch]
  );

  /** Shortlist a profile. Resolves to the API message, throws the error message. */
  const handleShortlist = useCallback(
    async (profileId) =>
      (await dispatch(reviewProfile({ profileId, action: "shortlist" })).unwrap()).message,
    [dispatch]
  );

  /** Reject a profile. Resolves to the API message, throws the error message. */
  const handleReject = useCallback(
    async (profileId) =>
      (await dispatch(reviewProfile({ profileId, action: "reject" })).unwrap()).message,
    [dispatch]
  );

  /** Queue an AI re-run for a profile. */
  const handleRerun = useCallback(
    (profileId) => dispatch(rerunRecommendation(profileId)).unwrap(),
    [dispatch]
  );

  /** Refresh AI status for profiles still being processed (polling). */
  const handleRefreshRecommendations = useCallback(
    (profileIds) => {
      if (!profileIds.length) return Promise.resolve();
      return dispatch(refreshProfileRecommendations(profileIds));
    },
    [dispatch]
  );

  /** Preview (PDF) or download (PPTX) a resume streamed by the backend. */
  const handlePreviewProfile = useCallback(async (profile) => {
    try {
      const blob = await fetchManagerProfileFile(profile.id);
      openBlobInNewTab(blob, profile.fileName);
    } catch (err) {
      throw getApiErrorMessage(err, "Could not open the file");
    }
  }, []);

  /** Clear error state */
  const handleClearError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  /** Forget the current opening (when leaving the detail page) */
  const handleClearCurrentOpening = useCallback(() => {
    lastProfilesIdRef.current = null;
    dispatch(clearCurrentOpening());
  }, [dispatch]);

  /** Reset module state */
  const handleResetHiringManager = useCallback(() => {
    lastListKeyRef.current = null;
    lastProfilesIdRef.current = null;
    dispatch(resetHiringManager());
  }, [dispatch]);

  return {
    // State
    openings,
    pagination,
    isLoading,
    error,
    currentOpening,
    profiles,
    summary,
    isProfilesLoading,
    profilesError,
    pendingActionIds,

    // Actions
    handleFetchOpenings,
    handleFetchProfiles,
    handleShortlist,
    handleReject,
    handleRerun,
    handleRefreshRecommendations,
    handlePreviewProfile,
    handleClearError,
    handleClearCurrentOpening,
    handleResetHiringManager,
  };
};

export default useHiringManager;
