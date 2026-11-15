import { NextResponse } from "next/server";
import { extractRoleFromToken } from "@/utils/Auth/middlewareUtils";
import { verifyAccessToken } from "@/utils/Auth/verifyToken";

// Areas that only one role may open, and each role's landing page.
const ROLE_GUARDED_AREAS = [
  { prefix: "/vendor", role: "IT_VENDOR" },
  { prefix: "/hiring-manager", role: "HIRING_MANAGER" },
];
const ROLE_HOME = {
  IT_VENDOR: "/vendor/openings",
  HIRING_MANAGER: "/hiring-manager/openings",
  BUSINESS_USER: "/business-user/digital-initiative",
  VENDOR_MANAGER: "/user",
};

export async function middleware(request) {
  // Get the pathname of the request
  const path = request.nextUrl.pathname;

  // Define public paths that don't require authentication
  const isPublicPath =
    path === "/login" ||
    path === "/register" ||
    path === "/setup-totp" ||
    path === "/session/restore" ||
    path.startsWith("/api/");

  // Check if we have auth cookies
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;
  const registrationToken = request.cookies.get("registration_token")?.value;

  // Authenticated = the access token's RS256 signature and expiry check out
  // (cookies alone can be forged). An expired/invalid access token with a
  // refresh token present can be renewed silently on /session/restore.
  const session = accessToken ? await verifyAccessToken(accessToken) : null;
  const isAuthenticated = !!session;
  const canRestore = !isAuthenticated && !!refreshToken;
  // A user is in registration process if they have the special token
  const isRegistering = !!registrationToken;

  // Extract role from access token and set it in a readable cookie
  const response = NextResponse.next();
  let userRole = null;

  if (isAuthenticated && accessToken) {
    userRole = extractRoleFromToken(accessToken);

    if (userRole) {
      // Set role cookie that JavaScript can read (non-HTTP-only)
      response.cookies.set("role", userRole, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    } else {
      // Clear role cookie if no valid role found
      response.cookies.delete("role");
    }
  } else if (!isAuthenticated) {
    // Clear role cookie when not authenticated
    response.cookies.delete("role");
  }

  // Special case: Registration flow
  if (isRegistering) {
    // If user has registration token, they must complete TOTP setup
    if (path !== "/setup-totp") {
      return NextResponse.redirect(new URL("/setup-totp", request.url));
    }
    return response;
  }

  // Redirect logged in users away from public pages except during registration
  if (isPublicPath && isAuthenticated) {
    // Role-based redirection
    console.log("User Role = ", userRole);
    switch (userRole) {
      case "VENDOR_MANAGER":
        console.log(`Redirecting VENDOR_MANAGER to /user`);
        return NextResponse.redirect(new URL("/user", request.url));

      case "BUSINESS_USER":
        console.log(
          `Redirecting BUSINESS_USER to /business-user/digital-initiative`
        );
        return NextResponse.redirect(
          new URL("/business-user/digital-initiative", request.url)
        );

      case "IT_VENDOR":
        console.log(`Redirecting IT_VENDOR to /vendor/openings`);
        return NextResponse.redirect(new URL("/vendor/openings", request.url));

      case "HIRING_MANAGER":
        console.log(`Redirecting HIRING_MANAGER to /hiring-manager/openings`);
        return NextResponse.redirect(
          new URL("/hiring-manager/openings", request.url)
        );

      default:
        // Fallback for unknown roles or missing role - redirect to base user page
        console.log(`Unknown role (${userRole}) - redirecting to /`);
        return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Expired session with a refresh token: renew it, then come back here.
  if (canRestore && (!isPublicPath || path === "/login")) {
    const restore = new URL("/session/restore", request.url);
    restore.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(restore);
  }

  // Redirect unauthenticated users to login page, dropping invalid cookies
  if (!isPublicPath && !isAuthenticated) {
    const toLogin = NextResponse.redirect(new URL("/login", request.url));
    if (accessToken) toLogin.cookies.delete("access_token");
    toLogin.cookies.delete("role");
    return toLogin;
  }

  // UI-level route guard: role-specific areas are only reachable by that
  // role (the backend enforces the same rule on every API call).
  const guardedArea = ROLE_GUARDED_AREAS.find(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`)
  );
  if (guardedArea && userRole !== guardedArea.role) {
    const home = ROLE_HOME[userRole] || "/";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return response;
}

// Configure middleware to run only on specific paths
export const config = {
  matcher: [
    // Protected routes
    "/user/:path*",
    "/vendor/:path*",
    "/business-user/:path*",
    "/hiring-manager/:path*",

    // Public paths for redirect logic
    "/login",
    "/register",
    "/setup-totp",
  ],
};
