import { redirect } from "next/navigation";
import { getAttendanceGateStatus } from "@/lib/attendance/gate";
import { requireAuth } from "@/lib/auth/permissions";
import OfficeSelfAttendanceCentre from "@/components/office/attendance/OfficeSelfAttendanceCentre";

export default async function AttendancePage() {
    const context = await requireAuth();
    if (context.isCompanyAdmin && !context.isOfficeMode) redirect("/office/admin/attendance");
    const attendance = await getAttendanceGateStatus(context);

    return <OfficeSelfAttendanceCentre attendance={attendance} />;
}
