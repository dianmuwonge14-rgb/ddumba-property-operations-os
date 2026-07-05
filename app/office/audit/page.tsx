import AuditReplayCentre from "@/components/office/audit/AuditReplayCentre";
import { getAuditCentreData } from "@/lib/audit-centre/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function AuditPage() {
    await requireCompanyAdminMode();
    const data = await getAuditCentreData();

    return <AuditReplayCentre data={data} />;
}
