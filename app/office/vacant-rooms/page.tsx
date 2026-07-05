import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { getVacantRoomsPageData } from "@/lib/vacant-rooms/data";
import VacantRoomsConsole from "@/components/office/vacant-rooms/VacantRoomsConsole";

export default async function OfficeVacantRoomsPage() {
    const context = await requireAuth();
    if (!hasPermission(context, "properties.read") && !hasPermission(context, "landlords.read") && !hasPermission(context, "collections.read")) {
        redirect("/office");
    }

    const data = await getVacantRoomsPageData({ admin: false });
    return <VacantRoomsConsole data={data} />;
}
