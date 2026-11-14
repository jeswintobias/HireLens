"use client";
import ErrorComponent from "@/components/common/ErrorComponent";

// Route-level error boundary for the Hiring Manager screens.
export default function HiringManagerError({ error, reset }) {
  console.error("[hiring-manager]", error);
  return (
    <ErrorComponent
      title="Something went wrong"
      message="This page failed to render. Please try again."
      onRetry={reset}
    />
  );
}
