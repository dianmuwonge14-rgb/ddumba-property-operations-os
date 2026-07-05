import LandlordPortfolioAuditCentre from "@/components/office/admin/LandlordPortfolioAuditCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getLandlordPortfolioAuditData } from "@/lib/landlord-portfolio-audit/data";

export default async function LandlordPortfolioAuditPage() {
    await requireCompanyAdminMode();
    const data = await getLandlordPortfolioAuditData();
    return <LandlordPortfolioAuditCentre data={data} />;
}
