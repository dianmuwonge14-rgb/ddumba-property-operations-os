import AdminPayrollCentre from "@/components/office/salary/AdminPayrollCentre";
import { getAdminPayrollCentreData } from "@/lib/salary-centre/data";
import { requireCompanyReadMode } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPayrollPage() {
    await requireCompanyReadMode();
    const data = await getAdminPayrollCentreData();
    return <AdminPayrollCentre data={data} />;
}
