import CommissionImportReviewCentre from "@/components/office/admin/CommissionImportReviewCentre";
import { getCommissionImportReviewData } from "@/lib/landlord-commission-import/review-data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function CommissionImportReviewPage() {
    await requireCompanyAdminMode();
    const data = await getCommissionImportReviewData();
    return <CommissionImportReviewCentre data={data} />;
}
