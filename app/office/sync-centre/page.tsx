import SyncCentre from "@/components/office/sync/SyncCentre";
import { requireAuth } from "@/lib/auth/permissions";

export default async function DesktopSyncCentrePage() {
    await requireAuth();
    return <SyncCentre />;
}
