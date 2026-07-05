import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { getAttendancePageData } from "@/lib/attendance/data";
import AttendanceConsole from "@/components/office/attendance/AttendanceConsole";

export default async function AdminAttendancePage() {
    const context = await requirePermission("attendance.read");
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    if (!isAdmin) notFound();

    const data = await getAttendancePageData();

    return (
        <AttendanceConsole
            canManage={context.isCompanyAdmin || context.permissions.includes("attendance.manage")}
            data={data}
            offices={context.offices}
        />
    );
}
