import NotificationsCentre from "@/components/office/notifications/NotificationsCentre";
import { getNotificationsCentreData } from "@/lib/notifications/data";

export const dynamic = "force-dynamic";

export default async function OfficeNotificationsPage() {
    let data: Awaited<ReturnType<typeof getNotificationsCentreData>> | null = null;
    let loadingError: string | null = null;

    try {
        data = await getNotificationsCentreData();
    } catch (error) {
        loadingError = error instanceof Error ? error.message : "Unknown notifications loading error.";
        console.error("Notifications could not load:", loadingError);
    }

    if (data) return <NotificationsCentre data={data} />;

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="enterprise-panel p-6">
                    <p className="text-xs font-black uppercase text-red-700">Notifications could not load</p>
                    <h1 className="mt-2 text-3xl font-black text-slate-950">Retry Notifications</h1>
                    <p className="mt-3 text-sm font-semibold text-slate-600">The notifications page stayed stable and caught the loading error instead of rendering a blank screen.</p>
                    <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs font-bold text-red-100">{loadingError}</pre>
                    <a href="/office/notifications" className="mt-5 inline-flex rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white">Retry</a>
                </section>
            </div>
        </main>
    );
}
