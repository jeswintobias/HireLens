import NotificationsLayout from "@/components/UserDashboardPage/Notifications/NotificationsLayout";
import ErrorBoundary from "@/components/common/ErrorBoundary";

export default function NotificationsPage() {
  return (
    <ErrorBoundary title="Notifications failed to load">
      <NotificationsLayout />
    </ErrorBoundary>
  );
}
