/**
 * Shared types for the contract hiring module (IT Vendor + Hiring Manager).
 */

/** The caller's identity, resolved from the authenticated request. */
export interface Actor {
  userId: string;
  tenantId: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OpeningListItem {
  id: string;
  title: string;
  location: string | null;
  contractType: string | null;
  postedDate: Date;
  status: string;
  experienceMin: number;
  experienceMax: number | null;
  hiringManagerName: string;
}

export interface VendorProfileItem {
  id: number;
  fileName: string;
  fileType: string;
  status: string;
  submittedAt: Date;
}

export interface VendorOpeningDetail extends OpeningListItem {
  description: string | null;
  expectedCompletionDate: Date | null;
  experienceRange: string;
  profilesCount: number;
  profiles: VendorProfileItem[];
}

/** Custom fields encrypted inside each upload token. */
export interface ProfileUploadTokenFields {
  openingId: string;
  uploadedBy: string;
}
