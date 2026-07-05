import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { getLandlordPayablesData } from "@/lib/landlord-payables/data";
import LandlordPaymentsConsole from "@/components/office/landlords/LandlordPaymentsConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LandlordPaymentsPage() {
    const context = await requireAuth();
    if (
        !hasPermission(context, "landlords.read") &&
        !hasPermission(context, "landlords.view") &&
        !hasPermission(context, "landlords.manage")
    ) {
        redirect("/office");
    }

    const data = await getLandlordPayablesData();
    return <LandlordPaymentsConsole data={data} />;
}
