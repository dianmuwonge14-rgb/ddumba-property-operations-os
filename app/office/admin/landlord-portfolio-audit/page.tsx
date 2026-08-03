import LandlordPortfolioAuditCentre from "@/components/office/admin/LandlordPortfolioAuditCentre";
import { requireCompanyReadMode } from "@/lib/auth/permissions";
import { getLandlordPortfolioAuditData } from "@/lib/landlord-portfolio-audit/data";

export default async function LandlordPortfolioAuditPage() {
    await requireCompanyReadMode();
    const data = await getLandlordPortfolioAuditData();
    return <LandlordPortfolioAuditCentre data={data} />;
}
