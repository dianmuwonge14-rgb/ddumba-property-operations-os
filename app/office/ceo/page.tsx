import CeoCommandCentre from "@/components/office/ceo/CeoCommandCentre";
import { getAdminCentreOverviewData } from "@/lib/admin-centre/data";
import { getCeoCommandData } from "@/lib/ceo-centre/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function CeoPage() {
    await requireCompanyAdminMode();
    const [data, adminAccountData] = await Promise.all([
        getCeoCommandData(),
        getAdminCentreOverviewData(),
    ]);

    return (
        <CeoCommandCentre
            adminAccountData={adminAccountData}
            data={data}
            serviceRoleConfigured={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
        />
    );
}
