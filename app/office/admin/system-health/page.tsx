import SystemHealthDeploymentCentre from "@/components/office/admin/SystemHealthDeploymentCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getAdminNotificationEmailSettingsData } from "@/lib/notifications/email-settings";
import { getProductionReadinessStatus } from "@/lib/production-readiness/data";

export default async function AdminSystemHealthPage() {
    await requireCompanyAdminMode();
    const [status, notificationEmailSettings] = await Promise.all([
        getProductionReadinessStatus(),
        getAdminNotificationEmailSettingsData(),
    ]);

    return <SystemHealthDeploymentCentre notificationEmailSettings={notificationEmailSettings} status={status} />;
}
