import OfficeEmployeeCentre from "@/components/office/employees/OfficeEmployeeCentre";
import { getOfficeEmployeeCentreData } from "@/lib/employee-management/office-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficeEmployeesPage() {
    const data = await getOfficeEmployeeCentreData();

    return <OfficeEmployeeCentre data={data} />;
}
