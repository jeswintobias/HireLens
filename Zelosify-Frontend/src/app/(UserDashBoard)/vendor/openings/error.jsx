"use client";
import ErrorComponent from "@/components/common/ErrorComponent";

// Route-level error boundary for the IT Vendor openings screens.
export default function VendorOpeningsError({ error, reset }) {
  console.error("[vendor/openings]", error);
  return (
    <ErrorComponent
      title="Something went wrong"
      message="This page failed to render. Please try again."
      onRetry={reset}
    />
  );
}
