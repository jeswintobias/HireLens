// src/utils/axiosInstance.js
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
});

// Add request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    // console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("API Request Error:", error);
    return Promise.reject(error);
  }
);

/**
 * Silent session refresh: when an API call fails with 401 because the access
 * token expired, renew it once via the httpOnly refresh_token cookie and retry
 * the call. Concurrent 401s share one refresh request. If the session has
 * ended, go to sign-in with an "expired" notice.
 */
const AUTH_PATHS = ["/auth/verify-login", "/auth/verify-totp", "/auth/register", "/auth/refresh", "/auth/logout"];
let refreshInFlight = null;

const isAuthCall = (config) => AUTH_PATHS.some((p) => (config?.url || "").includes(p));

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const publicPage = ["/", "/login", "/register"].includes(window.location.pathname);
  if (!publicPage) window.location.replace("/login?expired=1");
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response) {
      console.error(
        `API Error [${response.status}]: ${config?.method?.toUpperCase()} ${config?.url}`,
        response.data
      );
    } else {
      console.error(`API Error: ${error.message}`);
    }

    if (response?.status !== 401 || !config || config._retried || isAuthCall(config)) {
      return Promise.reject(error);
    }

    try {
      refreshInFlight ??= axiosInstance.post("/auth/refresh").finally(() => {
        refreshInFlight = null;
      });
      await refreshInFlight;
    } catch {
      redirectToLogin();
      return Promise.reject(error);
    }
    return axiosInstance({ ...config, _retried: true });
  }
);

export default axiosInstance;
