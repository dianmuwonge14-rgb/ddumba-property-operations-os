import { getExecutiveReportingData } from "@/lib/executive-reporting/data";
import ExecutiveReportingConsole from "@/components/office/executive-reporting/ExecutiveReportingConsole";
import { requireCompanyReadMode } from "@/lib/auth/permissions";

export default async function ReportsPage() {
    await requireCompanyReadMode();
    const data = await getExecutiveReportingData();

    return <ExecutiveReportingConsole data={data} />;
}
