import OfficeSidebar from "./OfficeSidebar";
import AttendanceAccessGate from "./AttendanceAccessGate";
import AttendanceStatusBanner from "./AttendanceStatusBanner";
import GlobalNotificationToasts from "./GlobalNotificationToasts";
import { getAttendanceGateStatus } from "@/lib/attendance/gate";
import { requireAuth } from "@/lib/auth/permissions";
import { getNotificationBadgeCount } from "@/lib/notifications/data";

export default async function OfficeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const context = await requireAuth();
    const isCollector = context.authMode === "collector";
    const [attendance, notificationCount] = await Promise.all([
        getAttendanceGateStatus(context),
        getNotificationBadgeCount(context),
    ]);

    return (
        <div className={`office-app-shell relative min-h-screen overflow-x-clip bg-slate-950 pt-[var(--app-header-offset)] ${isCollector ? "collector-account-scope" : ""}`}>
            <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_8%_4%,rgba(37,99,235,0.28),transparent_30%),radial-gradient(circle_at_92%_2%,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,#020617_0%,#07111f_48%,#0f172a_100%)]" />
            <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
            <OfficeSidebar
                isCollector={isCollector}
                isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
                officeName={context.activeOffice?.office_name ?? context.activeOffice?.name ?? null}
                attendance={attendance}
                notificationCount={notificationCount}
            />
            <div className="office-main-content relative z-10 min-w-0">
                <div className="px-4">
                    <AttendanceStatusBanner attendance={attendance} />
                </div>
                {children}
            </div>
            <GlobalNotificationToasts
                companyId={context.activeCompany?.id ?? null}
                officeId={context.activeOffice?.id ?? null}
                isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
            />
            <AttendanceAccessGate attendance={attendance} />
        </div>
    );
}
