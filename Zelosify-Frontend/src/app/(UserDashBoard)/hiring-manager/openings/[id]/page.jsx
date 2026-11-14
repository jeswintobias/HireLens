import ManagerOpeningDetailLayout from "@/components/UserDashboardPage/HIRING_MANAGER/Openings/ManagerOpeningDetailLayout";

export default async function ManagerOpeningDetailPage({ params }) {
  const { id } = await params;
  return <ManagerOpeningDetailLayout openingId={id} />;
}
