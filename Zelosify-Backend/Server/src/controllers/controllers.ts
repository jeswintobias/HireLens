// ===== Local AUTH =====
export {
  register,
  verifyLogin,
  verifyTOTP,
} from "./auth/local/localAuthController.js";

// ===== Session refresh + public key (route guard) =====
export { refreshSession, getPublicKey } from "./auth/local/login/refreshSession.js";

// ===== Unified AUTH Logout =====
export { logout } from "./auth/logout(unified)/logout.js";

// ===== User details retrieval =====
export { getUserDetails } from "./auth/user/getUserDetails.js";

// ===== STORAGE =====
export { listOfObjects } from "./storage/storageController.js";

// ===== FORM =====
export { createDigitalInitiative } from "./form/initiativeRequestController.js";

// ===== VENDOR MANAGEMENT =====
// Vendor resource requests
export {
  fetchRequestData,
  //   updateVendorRequest,
  //   generatePresignedUrls,
  //   uploadAttachment,
  //   // deleteAttachment,
} from "./vendor/resourceRequest/vendorRequestController.js";

// IT Vendor contract openings + candidate profiles
export {
  getVendorOpenings,
  getVendorOpeningById,
} from "./vendor/openings/vendorOpeningController.js";
export {
  presignVendorProfiles,
  uploadVendorProfiles,
  deleteVendorProfile,
  previewVendorProfile,
} from "./vendor/profiles/vendorProfileController.js";

// ===== HIRING MANAGEMENT =====
export { fetchData } from "./hiring/hiringProfileController.js";

// Hiring Manager contract openings, profiles + AI recommendations
export {
  getManagerOpenings,
  getManagerOpeningById,
  getManagerOpeningProfiles,
  shortlistManagerProfile,
  rejectManagerProfile,
  previewManagerProfile,
  getManagerProfileRecommendation,
  rerunManagerRecommendation,
} from "./hiringManager/hiringManagerController.js";
