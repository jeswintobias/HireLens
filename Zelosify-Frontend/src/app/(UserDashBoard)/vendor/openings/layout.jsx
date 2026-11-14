import RoleGuard from "@/components/common/RoleGuard";

// IT Vendor contract openings — UI route guard (middleware is the first layer).
const ALLOWED = ["IT_VENDOR"];

export default function VendorOpeningsRouteLayout({ children }) {
  return <RoleGuard allow={ALLOWED}>{children}</RoleGuard>;
}
