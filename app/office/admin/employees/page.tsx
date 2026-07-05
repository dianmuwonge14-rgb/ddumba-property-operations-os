import EmployeeManagementCentre from "@/components/office/admin/EmployeeManagementCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getEmployeeManagementData } from "@/lib/employee-management/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeManagementPage() {
    await requireCompanyAdminMode();
    const data = await getEmployeeManagementData();

    return <EmployeeManagementCentre data={data} />;
}
