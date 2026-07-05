import LaunchReadinessCentre from "@/components/office/launch/LaunchReadinessCentre";
import { getLaunchReadinessData } from "@/lib/launch-readiness/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function LaunchReadinessPage() {
    await requireCompanyAdminMode();
    const data = await getLaunchReadinessData();

    return <LaunchReadinessCentre data={data} />;
}
