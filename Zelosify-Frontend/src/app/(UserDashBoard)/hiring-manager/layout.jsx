import RoleGuard from "@/components/common/RoleGuard";

// This layout is for the role HIRING_MANAGER — UI route guard
// (middleware is the first layer, the backend enforces RBAC on every API).
const ALLOWED = ["HIRING_MANAGER"];

export default function HiringManagerLayout({ children }) {
  return <RoleGuard allow={ALLOWED}>{children}</RoleGuard>;
}
