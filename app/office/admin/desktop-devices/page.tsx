import DesktopDevicesConsole from "@/components/office/admin/DesktopDevicesConsole";
import { requireCompanyReadMode } from "@/lib/auth/permissions";

export default async function DesktopDevicesPage() {
    await requireCompanyReadMode();
    return <DesktopDevicesConsole />;
}
