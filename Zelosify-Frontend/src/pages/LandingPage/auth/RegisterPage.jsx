"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { BsMicrosoft } from "react-icons/bs";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { Briefcase, Building2, Check, Copy, ShieldCheck, UserCheck } from "lucide-react";
import SocialButton from "@/components/UI/SocialButton";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import Link from "next/link";

/** Google / Microsoft sign-in need OAuth apps configured in Keycloak; hidden until then. */
const SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SSO === "true";

/** Roles that can sign up here: the two personas of the contract hiring module. */
const ROLES = [
  {
    value: "IT_VENDOR",
    label: "IT Vendor",
    description: "Browse openings and submit candidate resumes",
    icon: Briefcase,
  },
  {
    value: "HIRING_MANAGER",
    label: "Hiring Manager",
    description: "Review AI-ranked candidates and decide",
    icon: UserCheck,
  },
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent dark:bg-gray-900 dark:text-white transition-colors duration-200";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1";

/** The <label> wraps its input, so the two are linked for screen readers and autofill. */
function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block">
        <span className={labelClass}>{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function PasswordInput({ name, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={8}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 pr-3 flex items-center"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? (
          <AiOutlineEyeInvisible className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        ) : (
          <AiOutlineEye className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        )}
      </button>
    </div>
  );
}

/** Step 2: enrol the authenticator app shown right after the account is created. */
function TwoFactorSetup({ qrCode, otpAuthUrl, username }) {
  const [copied, setCopied] = useState(false);
  const secret = (() => {
    try {
      return new URL(otpAuthUrl).searchParams.get("secret") || "";
    } catch {
      return "";
    }
  })();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the key is still visible to copy by hand */
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">
          Account <span className="text-sm font-semibold">{username}</span> created. Set up two-factor authentication
          to finish. You will need it every time you sign in.
        </p>
      </div>

      <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-decimal pl-5">
        <li className="text-sm">Open Google Authenticator, Microsoft Authenticator or Authy on your phone.</li>
        <li className="text-sm">Scan this QR code (or enter the setup key below).</li>
        <li className="text-sm">Sign in with your username, password and the 6-digit code from the app.</li>
      </ol>

      {qrCode && (
        <div className="flex justify-center">
          <img
            src={qrCode}
            alt="QR code for your authenticator app"
            width={200}
            height={200}
            className="rounded-lg border border-gray-200 bg-white p-2"
          />
        </div>
      )}

      {secret && (
        <div>
          <p className={labelClass}>Setup key</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-gray-100 dark:bg-gray-900 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
              {secret}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Keep this private. It is shown only once.
          </p>
        </div>
      )}

      <Link
        href="/login"
        className="block w-full text-center bg-black dark:bg-white text-white dark:text-black py-2 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors duration-200"
      >
        I&apos;ve added it, continue to sign in
      </Link>
    </div>
  );
}

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phoneNumber: "",
    department: "",
    tenantId: "",
    role: "IT_VENDOR",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [enrolment, setEnrolment] = useState(null);

  const handleChange = useCallback((e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError("");
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters long");
        return;
      }

      setIsLoading(true);
      try {
        const { confirmPassword, ...payload } = formData;
        const res = await axiosInstance.post("/auth/register", {
          ...payload,
          tenantId: payload.tenantId.trim(),
          username: payload.username.trim(),
          email: payload.email.trim(),
        });
        setEnrolment({
          qrCode: res.data.qrCode,
          otpAuthUrl: res.data.otpAuthUrl,
          username: res.data.user?.username ?? payload.username,
        });
      } catch (err) {
        const { status, data } = err.response ?? {};
        if (!err.response) setError("Cannot reach the server. Is the backend running?");
        else if (status === 400 && data?.message === "User already exists.")
          setError("That username or email is already registered. Try signing in.");
        else if (status === 400 && data?.message === "Invalid tenant ID.")
          setError("Organization ID not found. Check the ID your administrator gave you.");
        else if (status === 429) setError(data?.message || "Too many attempts. Please wait and try again.");
        else setError(data?.message || data?.error || "Registration failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [formData]
  );

  const startSso = useCallback(async (provider) => {
    try {
      const resp = await axiosInstance.get(`/auth/${provider}/login`);
      window.location.href = resp.data.authUrl;
    } catch {
      setError(`Failed to start ${provider === "google" ? "Google" : "Microsoft"} sign-in`);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-xl shadow-lg"
    >
      <div className="flex flex-col justify-center items-center gap-2">
        <img src={"/assets/logos/zelosify_Dark.png"} alt="Zelosify" width={120} height={40} className="dark:invert" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center">
          {enrolment ? "Secure your account" : "Create Account"}
        </h1>
        {!enrolment && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            Join your organization&apos;s contract hiring workspace
          </p>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 text-sm"
        >
          {error}
        </motion.div>
      )}

      {enrolment ? (
        <TwoFactorSetup {...enrolment} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className={labelClass}>I am a</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROLES.map(({ value, label, description, icon: Icon }) => {
                const active = formData.role === value;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30"
                        : "border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={active}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field
            label="Organization ID"
            hint="Your administrator shares this ID. For the demo data it is printed by npm run seed:openings."
          >
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                name="tenantId"
                required
                value={formData.tenantId}
                onChange={handleChange}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className={`${inputClass} pl-9`}
                autoComplete="off"
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input name="firstName" required value={formData.firstName} onChange={handleChange} className={inputClass} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <input name="lastName" required value={formData.lastName} onChange={handleChange} className={inputClass} autoComplete="family-name" />
            </Field>
            <Field label="Username">
              <input name="username" required value={formData.username} onChange={handleChange} className={inputClass} autoComplete="username" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required value={formData.email} onChange={handleChange} className={inputClass} autoComplete="email" />
            </Field>
            <Field label="Phone number">
              <input name="phoneNumber" type="tel" required value={formData.phoneNumber} onChange={handleChange} className={inputClass} autoComplete="tel" />
            </Field>
            <Field label="Department">
              <input name="department" required value={formData.department} onChange={handleChange} className={inputClass} placeholder="e.g. Engineering" />
            </Field>
            <Field label="Password">
              <PasswordInput name="password" value={formData.password} onChange={handleChange} autoComplete="new-password" />
            </Field>
            <Field label="Confirm password">
              <PasswordInput name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} autoComplete="new-password" />
            </Field>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full bg-black dark:bg-white text-white dark:text-black py-2 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </motion.button>
        </form>
      )}

      {SSO_ENABLED && !enrolment && (
        <div className="mt-6 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>
          <div className="space-y-2">
            <SocialButton icon={FcGoogle} onClick={() => startSso("google")} label="Sign up with Google" />
            <SocialButton icon={BsMicrosoft} onClick={() => startSso("microsoft")} label="Sign up with Microsoft" />
          </div>
        </div>
      )}

      {!enrolment && (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      )}
    </motion.div>
  );
}
