import DataIntegrityCentre from "@/components/office/admin/DataIntegrityCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getDataIntegrityCentreData } from "@/lib/data-integrity/data";

export default async function AdminDataIntegrityPage() {
    const context = await requireCompanyAdminMode();
    const data = await getDataIntegrityCentreData(context);

    return <DataIntegrityCentre data={data} />;
}
