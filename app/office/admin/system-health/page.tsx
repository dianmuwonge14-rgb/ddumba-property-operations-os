import SystemHealthDeploymentCentre from "@/components/office/admin/SystemHealthDeploymentCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getProductionReadinessStatus } from "@/lib/production-readiness/data";

export default async function AdminSystemHealthPage() {
    await requireCompanyAdminMode();
    const status = await getProductionReadinessStatus();

    return <SystemHealthDeploymentCentre status={status} />;
}
