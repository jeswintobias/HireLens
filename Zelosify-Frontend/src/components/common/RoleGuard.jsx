"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoleFromCookie } from "@/utils/Auth/roleUtils";
import CircleLoader from "@/components/UI/loaders/CircleLoader";

/**
 * UI-level route guard (second layer after `middleware.js`).
 * Renders children only for the allowed role; otherwise redirects to the
 * user's own home. The backend still enforces RBAC on every API call — this
 * guard only keeps users out of screens that are not theirs.
 */
export const ROLE_HOME = {
  IT_VENDOR: "/vendor/openings",
  HIRING_MANAGER: "/hiring-manager/openings",
  BUSINESS_USER: "/business-user/digital-initiative",
  VENDOR_MANAGER: "/user",
};

export default function RoleGuard({ allow, children }) {
  const router = useRouter();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const role = getRoleFromCookie();
    if (role && allow.includes(role)) {
      setStatus("allowed");
    } else {
      setStatus("denied");
      router.replace(role ? ROLE_HOME[role] || "/" : "/login");
    }
  }, [allow, router]);

  if (status !== "allowed") {
    return (
      <div className="flex h-[60vh] items-center justify-center" aria-busy="true">
        <CircleLoader />
      </div>
    );
  }
  return children;
}
