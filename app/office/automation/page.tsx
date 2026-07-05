import { getAutomationCentreData } from "@/lib/automation-centre/data";
import AutomationCentre from "@/components/office/automation/AutomationCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function AutomationPage() {
    await requireCompanyAdminMode();
    const data = await getAutomationCentreData();

    return <AutomationCentre data={data} />;
}
