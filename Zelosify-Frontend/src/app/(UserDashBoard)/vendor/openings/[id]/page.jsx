import VendorOpeningDetailLayout from "@/components/UserDashboardPage/IT_VENDOR/Openings/VendorOpeningDetailLayout";

export default async function VendorOpeningDetailPage({ params }) {
  const { id } = await params;
  return <VendorOpeningDetailLayout openingId={id} />;
}
