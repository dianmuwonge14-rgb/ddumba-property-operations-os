import SalaryCentre from "@/components/office/salary/SalaryCentre";
import { getPersonalSalaryCentreData } from "@/lib/salary-centre/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PersonalSalaryPage() {
    const data = await getPersonalSalaryCentreData();
    return <SalaryCentre data={data} />;
}
