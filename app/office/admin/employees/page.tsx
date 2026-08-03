import EmployeeManagementCentre from "@/components/office/admin/EmployeeManagementCentre";
import { requireCompanyReadMode } from "@/lib/auth/permissions";
import { getEmployeeManagementData } from "@/lib/employee-management/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeManagementPage() {
    await requireCompanyReadMode();
    const data = await getEmployeeManagementData();

    return <EmployeeManagementCentre data={data} />;
}
